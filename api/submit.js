// Submit — order note/tag + metafields + PDF certificate emailed to staff
import { shopifyGraphql } from './shopify.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, signature, idPhoto } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    let orderName = token;
    if (token.startsWith('test-')) {
      orderName = '#' + token.replace('test-', '');
    } else if (!token.startsWith('#')) {
      orderName = '#' + token;
    }

    const findQuery = `
      query FindOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              note
              tags
            }
          }
        }
      }
    `;
    const findData = await shopifyGraphql(findQuery, { query: `name:${orderName}` });
    const order = findData.orders.edges[0]?.node;

    if (!order) {
      return res.status(404).json({ error: 'Order not found', looked_for: orderName });
    }

    const timestamp = new Date().toISOString();
    const displayTime = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });

    // Evidence hash
    const hashInput = `${order.name}|${name}|${role || 'self'}|${timestamp}|${signature || ''}|${idPhoto || ''}`;
    const evidenceHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // Store metafields (signature, ID, signer info, hash)
    const metafields = [];
    if (signature) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'signature',
        type: 'multi_line_text_field',
        value: signature
      });
    }
    if (idPhoto) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'id_photo',
        type: 'multi_line_text_field',
        value: idPhoto
      });
    }
    metafields.push(
      { ownerId: order.id, namespace: 'pickup', key: 'signer_name', type: 'single_line_text_field', value: name },
      { ownerId: order.id, namespace: 'pickup', key: 'signer_role', type: 'single_line_text_field', value: role || 'self' },
      { ownerId: order.id, namespace: 'pickup', key: 'verified_at', type: 'single_line_text_field', value: timestamp },
      { ownerId: order.id, namespace: 'pickup', key: 'evidence_hash', type: 'single_line_text_field', value: evidenceHash }
    );

    if (metafields.length) {
      const mfMutation = `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key }
            userErrors { field message }
          }
        }
      `;
      await shopifyGraphql(mfMutation, { metafields });
    }

    // Note for timeline
    const noteLine = `PICKUP VERIFIED — Signed by ${name} (${role || 'self'}) on ${displayTime}. Certificate emailed. Evidence hash: ${evidenceHash.slice(0, 16)}…`;
    const newNote = order.note ? `${order.note}\n${noteLine}` : noteLine;

    const updateMutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id name note tags }
          userErrors { field message }
        }
      }
    `;

    const updateData = await shopifyGraphql(updateMutation, {
      input: {
        id: order.id,
        note: newNote,
        tags: [...new Set([...(order.tags || []), 'pickup-verified'])]
      }
    });

    if (updateData.orderUpdate.userErrors?.length) {
      return res.status(400).json({ ok: false, userErrors: updateData.orderUpdate.userErrors });
    }

    // Generate PDF certificate
    const pdfBytes = await generateCertificate({
      orderName: order.name,
      name,
      role: role || 'self',
      timestamp: displayTime,
      signature,
      idPhoto,
      evidenceHash
    });

    // Email the PDF
    let emailResult = { sent: false };
    try {
      emailResult = await sendCertificateEmail({
        orderName: order.name,
        name,
        role: role || 'self',
        timestamp: displayTime,
        evidenceHash,
        pdfBytes
      });
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
      emailResult = { sent: false, error: emailErr.message };
    }

    return res.status(200).json({
      ok: true,
      order_name: order.name,
      evidence_hash: evidenceHash,
      email: emailResult,
      message: 'Pickup verified. Certificate generated and emailed (if configured).'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function generateCertificate({ orderName, name, role, timestamp, signature, idPhoto, evidenceHash }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;

  page.drawText('Plumbing Market — Digital Pickup Certificate', {
    x: 50, y, size: 16, font: fontBold, color: rgb(0.1, 0.4, 0.2)
  });
  y -= 30;

  page.drawText(`Order: ${orderName}`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Signed by: ${name} (${role})`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Date/Time: ${timestamp}`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Evidence Hash (SHA-256): ${evidenceHash}`, { x: 50, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 40;

  page.drawText('Consent Statement', { x: 50, y, size: 12, font: fontBold });
  y -= 18;
  const consent = 'The signer confirmed they are the named person or an authorized representative, received the listed items in good condition, and accepted electronic signature for this pickup receipt.';
  page.drawText(consent, { x: 50, y, size: 9, font, maxWidth: 500, lineHeight: 12 });
  y -= 50;

  // Signature
  if (signature && signature.startsWith('data:image')) {
    try {
      const base64 = signature.split(',')[1];
      const imgBytes = Buffer.from(base64, 'base64');
      let image;
      if (signature.includes('image/png')) {
        image = await pdfDoc.embedPng(imgBytes);
      } else {
        image = await pdfDoc.embedJpg(imgBytes);
      }
      const dims = image.scale(0.4);
      page.drawText('Signature:', { x: 50, y, size: 11, font: fontBold });
      y -= dims.height + 10;
      page.drawImage(image, { x: 50, y, width: Math.min(dims.width, 300), height: Math.min(dims.height, 120) });
      y -= 20;
    } catch (e) {
      page.drawText('Signature image could not be embedded.', { x: 50, y, size: 10, font, color: rgb(0.6, 0, 0) });
      y -= 20;
    }
  }

  // ID Photo
  if (idPhoto && idPhoto.startsWith('data:image')) {
    try {
      const base64 = idPhoto.split(',')[1];
      const imgBytes = Buffer.from(base64, 'base64');
      let image;
      if (idPhoto.includes('image/png')) {
        image = await pdfDoc.embedPng(imgBytes);
      } else {
        image = await pdfDoc.embedJpg(imgBytes);
      }
      const dims = image.scale(0.35);
      page.drawText('Government ID Photo:', { x: 50, y, size: 11, font: fontBold });
      y -= Math.min(dims.height, 180) + 10;
      page.drawImage(image, { x: 50, y, width: Math.min(dims.width, 250), height: Math.min(dims.height, 180) });
    } catch (e) {
      page.drawText('ID photo could not be embedded.', { x: 50, y, size: 10, font, color: rgb(0.6, 0, 0) });
    }
  }

  return await pdfDoc.save();
}

async function sendCertificateEmail({ orderName, name, role, timestamp, evidenceHash, pdfBytes }) {
  const user = process.env.SMTP_USER || 'info@plumbingmarket.ca';
  const pass = (process.env.SMTP_PASS || 'qyap gctt ggrd llxd').replace(/\s+/g, '');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  const info = await transporter.sendMail({
    from: `"Plumbing Market Pickup" <${user}>`,
    to: user,
    subject: `Pickup Certificate — Order ${orderName}`,
    text: `Digital pickup certificate for order ${orderName}.\n\nSigned by: ${name} (${role})\nTime: ${timestamp}\nEvidence Hash: ${evidenceHash}\n\nThe PDF certificate is attached.`,
    attachments: [
      {
        filename: `pickup-certificate-${orderName.replace('#', '')}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf'
      }
    ]
  });

  return { sent: true, messageId: info.messageId };
}

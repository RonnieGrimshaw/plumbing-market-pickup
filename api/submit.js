// Submit — order note/tag + metafields + PDF certificate emailed to staff
import { shopifyGraphql } from './shopify.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, signature, idPhoto, items } = req.body || {};

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

    const hashInput = `${order.name}|${name}|${role || 'self'}|${timestamp}|${signature || ''}|${idPhoto || ''}`;
    const evidenceHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const metafields = [];
    if (signature) {
      metafields.push({ ownerId: order.id, namespace: 'pickup', key: 'signature', type: 'multi_line_text_field', value: signature });
    }
    if (idPhoto) {
      metafields.push({ ownerId: order.id, namespace: 'pickup', key: 'id_photo', type: 'multi_line_text_field', value: idPhoto });
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

    const pdfBytes = await generateCertificate({
      orderName: order.name,
      name,
      role: role || 'self',
      timestamp: displayTime,
      signature,
      idPhoto,
      evidenceHash,
      items: items || []
    });

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

async function generateCertificate({ orderName, name, role, timestamp, signature, idPhoto, evidenceHash, items }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.04, 0.45, 0.28);
  const dark = rgb(0.15, 0.15, 0.15);
  const gray = rgb(0.4, 0.4, 0.4);

  page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: green });
  page.drawText('PLUMBING MARKET', { x: 40, y: 760, size: 14, font: fontBold, color: rgb(1,1,1) });
  page.drawText('Digital Pickup Certificate', { x: 40, y: 745, size: 10, font, color: rgb(0.9,1,0.9) });

  let y = 710;
  page.drawText(`Order ${orderName}`, { x: 40, y, size: 18, font: fontBold, color: dark });
  y -= 22;
  page.drawText(`Verified on ${timestamp}`, { x: 40, y, size: 10, font, color: gray });
  y -= 30;

  page.drawRectangle({ x: 36, y: y - 55, width: 540, height: 70, borderColor: rgb(0.85,0.85,0.85), borderWidth: 1 });
  page.drawText('PICKED UP BY', { x: 48, y: y - 18, size: 8, font: fontBold, color: green });
  page.drawText(`${name}`, { x: 48, y: y - 36, size: 13, font: fontBold, color: dark });
  page.drawText(`Role: ${role}`, { x: 48, y: y - 52, size: 10, font, color: gray });
  y -= 85;

  page.drawText('Items Confirmed for Pickup', { x: 40, y, size: 12, font: fontBold, color: dark });
  y -= 14;
  page.drawText('(This order contains special order items)', { x: 40, y, size: 9, font, color: rgb(0.6, 0.2, 0) });
  y -= 18;

  if (items && items.length) {
    for (const item of items) {
      if (item.image) {
        try {
          const imgRes = await fetch(item.image);
          if (imgRes.ok) {
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            let img;
            if (item.image.includes('.png')) {
              img = await pdfDoc.embedPng(imgBuf);
            } else {
              img = await pdfDoc.embedJpg(imgBuf);
            }
            const d = img.scale(0.15);
            page.drawImage(img, { x: 40, y: y - 28, width: Math.min(d.width, 36), height: Math.min(d.height, 36) });
          }
        } catch {}
      }

      const line = `${item.quantity}×  ${item.title || item.name}${item.variantTitle ? ' — ' + item.variantTitle : ''}`;
      page.drawText(line, { x: 85, y, size: 9, font, color: dark });
      if (item.sku) {
        page.drawText(`SKU: ${item.sku}`, { x: 85, y: y - 12, size: 7, font, color: gray });
      }
      if (item.initial) {
        page.drawText(`Initials: ${item.initial}`, { x: 430, y: y - 4, size: 10, font: fontBold, color: green });
      }
      y -= 40;
      if (y < 140) break;
    }
  } else {
    page.drawText('(Item list not provided)', { x: 48, y, size: 9, font, color: gray });
    y -= 16;
  }

  y -= 10;
  page.drawText('Consent', { x: 40, y, size: 11, font: fontBold, color: dark });
  y -= 16;
  const consent = 'The signer confirmed identity (or authorized representation), received the initialed items in good condition, and accepted electronic signature for this pickup. The signer has read and agreed to the return policy: https://www.plumbingmarket.ca/policies/refund-policy. Responsibility for the goods transfers upon handover.';
  page.drawText(consent, { x: 40, y, size: 8, font, color: dark, maxWidth: 520, lineHeight: 11 });
  y -= 60;

  if (signature && signature.startsWith('data:image')) {
    try {
      const b64 = signature.split(',')[1];
      const bytes = Buffer.from(b64, 'base64');
      const img = signature.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const d = img.scale(0.35);
      page.drawText('Signature', { x: 40, y, size: 10, font: fontBold, color: dark });
      y -= Math.min(d.height, 90) + 8;
      page.drawImage(img, { x: 40, y, width: Math.min(d.width, 280), height: Math.min(d.height, 90) });
      y -= 15;
    } catch {}
  }

  if (idPhoto && idPhoto.startsWith('data:image') && y > 160) {
    try {
      const b64 = idPhoto.split(',')[1];
      const bytes = Buffer.from(b64, 'base64');
      const img = idPhoto.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const d = img.scale(0.3);
      page.drawText('Government ID', { x: 40, y, size: 10, font: fontBold, color: dark });
      y -= Math.min(d.height, 140) + 8;
      page.drawImage(img, { x: 40, y, width: Math.min(d.width, 220), height: Math.min(d.height, 140) });
    } catch {}
  }

  page.drawText(`Evidence Hash (SHA-256): ${evidenceHash}`, { x: 40, y: 40, size: 6.5, font, color: gray });
  page.drawText('This certificate was generated automatically by the Plumbing Market Pickup Verification system.', { x: 40, y: 28, size: 6.5, font, color: gray });

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

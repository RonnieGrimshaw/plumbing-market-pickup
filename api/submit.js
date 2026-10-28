// Submit — order note/tag + metafields + PDF certificate emailed to staff
import { shopifyGraphql } from './shopify.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, signature, idPhoto, staff, staffNotes, confirmOrderName, authorizedBy, authMethod } = req.body || {};

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

    let noteLine = `\n\nPICKUP VERIFIED\nSigned by: ${name} (${role || 'self'})\nTime: ${displayTime}`;
    if (confirmOrderName) noteLine += `\nConfirmed order name: ${confirmOrderName}`;
    if (authorizedBy) noteLine += `\nAuthorized by: ${authorizedBy} (${authMethod || ''})`;
    if (staff) noteLine += `\nStaff: ${staff}`;
    if (staffNotes) noteLine += `\nStaff notes: ${staffNotes}`;
    noteLine += `\nCertificate emailed to staff.\nEvidence hash: ${evidenceHash.slice(0, 16)}…`;
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

    let pdfBytes = null;
    try {
      pdfBytes = await generateCertificate({
        orderName: order.name,
        name,
        role: role || 'self',
        timestamp: displayTime,
        signature,
        idPhoto,
        evidenceHash,
        items: req.body.items || [],
        confirmOrderName,
        authorizedBy,
        authMethod,
        staff,
        staffNotes
      });
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
    }

    let emailResult = { sent: false };
    if (pdfBytes) {
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
    }

    return res.status(200).json({
      ok: true,
      order_name: order.name,
      evidence_hash: evidenceHash,
      email: emailResult,
      message: 'Pickup verified.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}

async function generateCertificate({ orderName, name, role, timestamp, signature, idPhoto, evidenceHash, items, confirmOrderName, authorizedBy, authMethod, staff, staffNotes }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.15, 0.45, 0.25);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: green });
  page.drawText('PLUMBING MARKET', { x: 40, y: 760, size: 14, font: fontBold, color: rgb(1,1,1) });
  page.drawText('Digital Pickup Certificate', { x: 40, y: 745, size: 10, font, color: rgb(0.9,1,0.9) });

  let y = 700;
  page.drawText(`Order ${orderName}`, { x: 40, y, size: 18, font: fontBold, color: dark });
  y -= 22;
  page.drawText(`Verified on ${timestamp}`, { x: 40, y, size: 10, font, color: gray });
  y -= 30;

  page.drawRectangle({ x: 36, y: y - 55, width: 540, height: 70, borderColor: rgb(0.85,0.85,0.85), borderWidth: 1 });
  page.drawText('PICKED UP BY', { x: 48, y: y - 18, size: 8, font: fontBold, color: green });
  page.drawText(`${name}`, { x: 48, y: y - 36, size: 13, font: fontBold, color: dark });
  page.drawText(`Role: ${role}`, { x: 48, y: y - 52, size: 10, font, color: gray });
  if (confirmOrderName) page.drawText(`Confirmed order name: ${confirmOrderName}`, { x: 48, y: y - 66, size: 9, font, color: gray });
  if (authorizedBy) page.drawText(`Authorized by: ${authorizedBy} (${authMethod || 'not specified'})`, { x: 48, y: y - 78, size: 9, font, color: gray });
  if (staff) page.drawText(`Staff: ${staff}`, { x: 48, y: y - 90, size: 9, font, color: gray });
  if (staffNotes) page.drawText(`Staff notes: ${staffNotes}`, { x: 48, y: y - 102, size: 9, font, color: gray });
  y -= 120;

  page.drawText('Items Confirmed for Pickup', { x: 40, y, size: 12, font: fontBold, color: dark });
  y -= 16;
  page.drawText('(This order contains special order items)', { x: 40, y, size: 9, font, color: rgb(0.6, 0.2, 0) });
  y -= 20;

  if (items && items.length) {
    for (const item of items) {
      if (y < 120) break;
      if (item.image) {
        try {
          const resp = await fetch(item.image);
          const imgBuf = await resp.arrayBuffer();
          const ct = resp.headers.get('content-type') || '';
          let img;
          if (ct.includes('png')) img = await pdfDoc.embedPng(imgBuf);
          else if (ct.includes('jpeg') || ct.includes('jpg')) img = await pdfDoc.embedJpg(imgBuf);
          else { try { img = await pdfDoc.embedPng(imgBuf); } catch { img = await pdfDoc.embedJpg(imgBuf); } }
          const d = img.scale(0.15);
          page.drawImage(img, { x: 40, y: y - 32, width: Math.min(d.width, 40), height: Math.min(d.height, 40) });
        } catch {}
      }
      const line = `${item.quantity || 1}x ${item.title || item.name || 'Item'}`;
      page.drawText(line, { x: 85, y, size: 9, font, color: dark });
      if (item.sku) page.drawText(`SKU: ${item.sku}`, { x: 85, y: y - 12, size: 7, font, color: gray });
      if (item.initial) page.drawText(`Initials: ${item.initial}`, { x: 430, y: y - 4, size: 10, font: fontBold, color: green });
      y -= 40;
    }
  } else {
    page.drawText('(Item list not provided)', { x: 48, y, size: 9, font, color: gray });
    y -= 20;
  }

  y -= 10;
  page.drawText('Consent', { x: 40, y, size: 11, font: fontBold, color: dark });
  y -= 16;
  const consent = 'The signer confirmed identity (or authorized representation), received the initialed items in good condition, and accepted electronic signature for this pickup. The signer has read and agreed to the return policy: https://www.plumbingmarket.ca/policies/refund-policy. Responsibility for the goods transfers upon handover.';
  page.drawText(consent, { x: 40, y, size: 8, font, color: dark, maxWidth: 520, lineHeight: 11 });
  y -= 70;

  if (signature) {
    try {
      const sigImg = await pdfDoc.embedPng(signature);
      page.drawImage(sigImg, { x: 40, y: y - 60, width: 180, height: 60 });
      page.drawText('Signature', { x: 40, y: y + 8, size: 8, font: fontBold, color: gray });
    } catch {}
  }
  if (idPhoto) {
    try {
      const idImg = await pdfDoc.embedJpg(idPhoto) || await pdfDoc.embedPng(idPhoto);
      page.drawImage(idImg, { x: 280, y: y - 80, width: 140, height: 90 });
      page.drawText('Photo ID', { x: 280, y: y + 8, size: 8, font: fontBold, color: gray });
    } catch {}
  }

  page.drawText(`Evidence Hash: ${evidenceHash}`, { x: 40, y: 50, size: 7, font, color: gray });
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

// Staff uploads product photos — generates professional PDF certificate and emails it
import nodemailer from 'nodemailer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { shopifyGraphql } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, photos } = req.body || {};
  if (!orderId || !photos?.length || photos.length < 3) {
    return res.status(400).json({ error: 'At least 3 product photos are required' });
  }

  try {
    let orderName = orderId.replace(/[^0-9#]/g, '');
    if (!orderName.startsWith('#')) orderName = '#' + orderName;

    const query = `
      query GetEvidence($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              metafield(namespace: "pickup", key: "evidence") { value }
              signature: metafield(namespace: "pickup", key: "signature") { value }
              idPhoto: metafield(namespace: "pickup", key: "id_photo") { value }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphql(query, { query: `name:${orderName}` });
    const order = data.orders.edges[0]?.node;

    let evidence = {};
    if (order?.metafield?.value) {
      try { evidence = JSON.parse(order.metafield.value); } catch {}
    }
    if (order?.signature?.value) evidence.signature = order.signature.value;
    if (order?.idPhoto?.value) evidence.idPhoto = order.idPhoto.value;

    const pdfBytes = await generateCertificate({
      orderName: order?.name || orderName,
      evidence,
      photos
    });

    const user = process.env.SMTP_USER || 'info@plumbingmarket.ca';
    const pass = (process.env.SMTP_PASS || 'qyap gctt ggrd llxd').replace(/\s+/g, '');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

    const attachments = [{
      filename: `Pickup-Certificate-${orderName.replace('#', '')}.pdf`,
      content: Buffer.from(pdfBytes),
      contentType: 'application/pdf'
    }];

    photos.forEach((p, i) => {
      if (!p.data || !p.data.includes(',')) return;
      const base64 = p.data.split(',')[1];
      const mime = p.data.match(/data:(image\/\w+)/)?.[1] || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      attachments.push({
        filename: `product-${i + 1}.${ext}`,
        content: Buffer.from(base64, 'base64'),
        contentType: mime
      });
    });

    if (evidence.idPhoto && evidence.idPhoto.includes(',')) {
      const base64 = evidence.idPhoto.split(',')[1];
      const mime = evidence.idPhoto.match(/data:(image\/\w+)/)?.[1] || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      attachments.push({
        filename: `customer-id.${ext}`,
        content: Buffer.from(base64, 'base64'),
        contentType: mime
      });
    }

    if (evidence.signature && evidence.signature.includes(',')) {
      const base64 = evidence.signature.split(',')[1];
      attachments.push({
        filename: 'customer-signature.png',
        content: Buffer.from(base64, 'base64'),
        contentType: 'image/png'
      });
    }

    const info = await transporter.sendMail({
      from: `"Plumbing Market Pickup" <${user}>`,
      to: user,
      subject: `Pickup Certificate — Order ${orderName}`,
      text: `Pickup verification certificate for order ${orderName}.\n\nPerson: ${evidence.name || 'Unknown'}\nTime: ${evidence.displayTime || new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}\n\nAttachments:\n- PDF certificate\n- Product photos\n- Customer ID photo\n- Customer signature\n\nFull return policy: https://www.plumbingmarket.ca/policies/refund-policy`,
      attachments
    });

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      photos_sent: photos.length,
      certificate: true,
      hasId: !!evidence.idPhoto
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function generateCertificate({ orderName, evidence, photos }) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 40;

  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: rgb(0.77, 0.12, 0.23) });
  page.drawText('PLUMBING MARKET', { x: 40, y: height - 35, size: 18, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Pickup Verification Certificate', { x: 40, y: height - 55, size: 11, font: font, color: rgb(1, 1, 1) });

  y = height - 100;
  page.drawText(`Order: ${orderName}`, { x: 40, y, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  page.drawText(`Date: ${evidence.displayTime || new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}`, { x: 40, y, size: 10, font: font, color: rgb(0.3, 0.3, 0.3) });
  y -= 18;
  page.drawText(`Person picking up: ${evidence.name || '—'}  (${evidence.role || 'Self'})`, { x: 40, y, size: 10, font: font, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  if (evidence.staff) {
    page.drawText(`Staff: ${evidence.staff}`, { x: 40, y, size: 9, font: font, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
  }

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;

  page.drawText('Items Confirmed for Pickup', { x: 40, y, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 18;
  const items = evidence.items || [];
  for (const item of items.slice(0, 12)) {
    const title = (item.title || item.name || 'Item').slice(0, 45);
    page.drawText(`• ${title}`, { x: 40, y, size: 9, font: font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`SKU: ${item.sku || '—'}  Qty: ${item.quantity || 1}  Initials: ${item.initial || '—'}`, { x: 55, y: y - 12, size: 8, font: font, color: rgb(0.4, 0.4, 0.4) });
    y -= 28;
    if (y < 200) break;
  }

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;

  page.drawText('Customer Signature', { x: 40, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 10;
  if (evidence.signature && evidence.signature.startsWith('data:image')) {
    try {
      const sigImg = await embedImage(doc, evidence.signature);
      if (sigImg) {
        const dims = sigImg.scale(0.25);
        page.drawImage(sigImg, { x: 40, y: y - Math.min(dims.height, 60), width: Math.min(dims.width, 200), height: Math.min(dims.height, 60) });
        y -= Math.min(dims.height, 60) + 10;
      }
    } catch (e) { console.error('sig', e.message); }
  } else {
    page.drawText('(Signature on file)', { x: 40, y: y - 15, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
    y -= 25;
  }

  if (y < 180) {
    page = doc.addPage([612, 792]);
    y = page.getSize().height - 50;
  }
  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 18;
  page.drawText('Return Policy Acknowledgment', { x: 40, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  page.drawText('By signing above, the person picking up confirms they have read and agree to', { x: 40, y, size: 8, font: font, color: rgb(0.2, 0.2, 0.2) });
  y -= 12;
  page.drawText('the Plumbing Market Refund Policy.', { x: 40, y, size: 8, font: font, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  page.drawText('Summary:', { x: 40, y, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 12;
  const policyLines = [
    '• Returns accepted within 30 days if in original, undamaged, resalable condition.',
    '• Special order items are final sale and cannot be cancelled or returned.',
    '• Assembled, installed, open-box, clearance, and non-returnable items cannot be returned.',
    '• Outbound shipping charges are non-refundable. Return shipping is deducted from any refund.',
    '• Once items are handed over at pickup, they become the responsibility of the person receiving them.'
  ];
  for (const line of policyLines) {
    page.drawText(line, { x: 40, y, size: 7.5, font: font, color: rgb(0.25, 0.25, 0.25) });
    y -= 11;
  }
  y -= 6;
  page.drawText('Full policy: https://www.plumbingmarket.ca/policies/refund-policy', { x: 40, y, size: 8, font: font, color: rgb(0.77, 0.12, 0.23) });

  if (evidence.idPhoto && evidence.idPhoto.startsWith('data:image')) {
    const idPage = doc.addPage([612, 792]);
    idPage.drawText('Photo ID', { x: 40, y: 750, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    const idLen = evidence.idPhoto.length;
    try {
      const idImg = await embedImage(doc, evidence.idPhoto);
      if (idImg) {
        const maxW = 520;
        const maxH = 680;
        const scale = Math.min(maxW / idImg.width, maxH / idImg.height, 1);
        const w = idImg.width * scale;
        const h = idImg.height * scale;
        idPage.drawImage(idImg, { x: 46, y: 720 - h, width: w, height: h });
      } else {
        idPage.drawText(`(ID photo could not be embedded — stored length ${idLen})`, { x: 40, y: 700, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
      }
    } catch (e) {
      console.error('id embed', e.message);
      idPage.drawText(`(ID embed failed: ${e.message.slice(0, 50)})`, { x: 40, y: 700, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
    }
  } else {
    const idPage = doc.addPage([612, 792]);
    idPage.drawText('Photo ID: not on file', { x: 40, y: 750, size: 12, font: font, color: rgb(0.5, 0.5, 0.5) });
  }

  if (photos?.length) {
    const photoPage = doc.addPage([612, 792]);
    photoPage.drawText('Product Photos (Staff)', { x: 40, y: 740, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    let x = 40;
    let py = 720;
    for (const p of photos.slice(0, 3)) {
      if (!p.data || !p.data.startsWith('data:image')) continue;
      try {
        const img = await embedImage(doc, p.data);
        if (img) {
          const dims = img.scale(0.25);
          const h = Math.min(dims.height, 180);
          const w = Math.min(dims.width, 220);
          if (x + w > 550) { x = 40; py -= h + 15; }
          photoPage.drawImage(img, { x, y: py - h, width: w, height: h });
          x += w + 15;
        }
      } catch (e) { console.error('photo', e.message); }
    }
  }

  page.drawText(`Evidence hash: ${(evidence.evidenceHash || '').slice(0, 32)}…`, { x: 40, y: 40, size: 7, font: font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText('Plumbing Market · Vaughan, ON · 289-236-2378', { x: 40, y: 28, size: 7, font: font, color: rgb(0.5, 0.5, 0.5) });

  return await doc.save();
}

async function embedImage(doc, dataUrl) {
  if (!dataUrl || !dataUrl.includes(',')) return null;
  let base64 = dataUrl.split(',')[1] || '';
  base64 = base64.replace(/\s/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  while (base64.length % 4 !== 0) base64 += '=';
  let bytes;
  try { bytes = Buffer.from(base64, 'base64'); } catch { return null; }
  if (!bytes || bytes.length < 100) return null;

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8;

  try {
    if (isPng) return await doc.embedPng(bytes);
    if (isJpg) return await doc.embedJpg(bytes);
    try { return await doc.embedJpg(bytes); } catch {}
    try { return await doc.embedPng(bytes); } catch {}
    return null;
  } catch (e) {
    console.error('embed failed', e.message, 'len', bytes.length);
    return null;
  }
}

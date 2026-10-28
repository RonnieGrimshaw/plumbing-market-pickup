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

    const info = await transporter.sendMail({
      from: `"Plumbing Market Pickup" <${user}>`,
      to: user,
      subject: `Pickup Certificate — Order ${orderName}`,
      text: `Pickup verification certificate for order ${orderName}.\n\nPerson: ${evidence.name || 'Unknown'}\nTime: ${evidence.displayTime || new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}\n\nSee attached PDF for full evidence.`,
      attachments: [{
        filename: `Pickup-Certificate-${orderName.replace('#', '')}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf'
      }]
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

  // ID photo — always on its own page so it is never cut off
  if (evidence.idPhoto && evidence.idPhoto.startsWith('data:image')) {
    const idPage = doc.addPage([612, 792]);
    idPage.drawText('Photo ID', { x: 40, y: 740, size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    try {
      const idImg = await embedImage(doc, evidence.idPhoto);
      if (idImg) {
        const dims = idImg.scale(0.5);
        const h = Math.min(dims.height, 400);
        const w = Math.min(dims.width, 500);
        idPage.drawImage(idImg, { x: 40, y: 720 - h, width: w, height: h });
      }
    } catch (e) { console.error('id', e.message); idPage.drawText('(ID photo could not be embedded)', { x: 40, y: 700, size: 10, font: font, color: rgb(0.5, 0.5, 0.5) }); }
  }

  // Product photos page
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
  const base64 = dataUrl.split(',')[1];
  const bytes = Buffer.from(base64, 'base64');
  if (dataUrl.includes('image/png')) {
    return await doc.embedPng(bytes);
  }
  return await doc.embedJpg(bytes);
}

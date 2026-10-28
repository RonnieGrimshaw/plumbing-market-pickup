// Staff uploads product photos — emails them to info@plumbingmarket.ca
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, photos } = req.body || {};
  if (!orderId || !photos?.length) {
    return res.status(400).json({ error: 'Missing orderId or photos' });
  }

  try {
    const user = process.env.SMTP_USER || 'info@plumbingmarket.ca';
    const pass = (process.env.SMTP_PASS || 'qyap gctt ggrd llxd').replace(/\s+/g, '');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });

    const attachments = photos.map((p, i) => {
      const base64 = p.data.split(',')[1];
      const mime = p.data.match(/data:(image\/\w+)/)?.[1] || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      return {
        filename: `product-${i + 1}.${ext}`,
        content: Buffer.from(base64, 'base64'),
        contentType: mime
      };
    });

    const info = await transporter.sendMail({
      from: `"Plumbing Market Pickup" <${user}>`,
      to: user,
      subject: `Product Photos — Order ${orderId}`,
      text: `Staff product photos for order ${orderId}.\n\n${photos.length} photo(s) attached.\nTaken at: ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}`,
      attachments
    });

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      photos_sent: photos.length
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

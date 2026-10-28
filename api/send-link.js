// Send pickup link via SMS (Aircall) or Email
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, phone, email, name, method } = req.body || {};

  const token = orderId || `test-${Date.now()}`;
  const link = `https://pickup.plumbingmarket.ca/?token=${encodeURIComponent(token)}`;
  const message = `Plumbing Market: Your order ${orderId} is ready for pickup.\n\nSign here: ${link}\n\nVaughan, ON\nPhone: 289-236-2378`;

  try {
    if (method === 'email' || (!method && email)) {
      const user = process.env.SMTP_USER || 'info@plumbingmarket.ca';
      const pass = (process.env.SMTP_PASS || 'qyap gctt ggrd llxd').replace(/\s+/g, '');

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
      });

      const info = await transporter.sendMail({
        from: `"Plumbing Market" <${user}>`,
        to: email,
        subject: `Your order ${orderId} is ready for pickup`,
        text: `Hi ${name || 'there'},\n\nYour order ${orderId} is ready for pickup at Plumbing Market.\n\nPlease sign your digital pickup receipt here:\n${link}\n\nStore Location\nPlumbing Market\nVaughan, ON\nPhone: 289-236-2378\n\nThank you,\nPlumbing Market`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
          <h2 style="color:#c41e3a;margin:0 0 1rem;">Your order is ready</h2>
          <p>Hi ${name || 'there'},</p>
          <p>Your order <strong>${orderId}</strong> is ready for pickup.</p>
          <p style="margin:1.5rem 0;"><a href="${link}" style="background:#c41e3a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Sign Pickup Receipt</a></p>
          <p style="color:#555;font-size:0.9rem;">Or copy this link:<br><a href="${link}">${link}</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:1.5rem 0;">
          <p style="font-size:0.9rem;color:#555;line-height:1.7;">
            <strong>Plumbing Market</strong><br>
            Vaughan, ON<br>
            Phone: <a href="tel:2892362378" style="color:#c41e3a;">289-236-2378</a>
          </p>
          <p style="font-size:0.85rem;color:#888;margin-top:1.5rem;">Thank you,<br>Plumbing Market</p>
        </div>`
      });

      return res.status(200).json({
        ok: true,
        method: 'email',
        token,
        link,
        to: email,
        messageId: info.messageId
      });
    } else {
      let to = (phone || '').trim();
      if (!to.startsWith('+')) {
        to = '+1' + to.replace(/\D/g, '');
      }

      const numberId = process.env.AIRCALL_NUMBER_ID;
      if (!numberId || !process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
        return res.status(500).json({ ok: false, error: 'Aircall credentials not configured in Vercel' });
      }

      const url = `https://api.aircall.io/v1/numbers/${numberId}/messages/native/send`;

      const aircallRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.AIRCALL_API_ID}:${process.env.AIRCALL_API_TOKEN}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to, body: message })
      });

      const aircallData = await aircallRes.json().catch(() => ({}));

      if (!aircallRes.ok) {
        const detail = aircallData.message || aircallData.error || JSON.stringify(aircallData).slice(0, 200);
        return res.status(200).json({
          ok: false,
          method: 'sms',
          to,
          error: `Aircall ${aircallRes.status}: ${detail}`,
          aircall: aircallData
        });
      }

      return res.status(200).json({
        ok: true,
        method: 'sms',
        token,
        link,
        to,
        aircall: aircallData
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

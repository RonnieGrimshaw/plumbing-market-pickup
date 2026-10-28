// Send pickup link via SMS (Aircall) or Email
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, phone, email, name, method } = req.body || {};

  const token = orderId || `test-${Date.now()}`;
  const link = `https://pickup.plumbingmarket.ca/?token=${encodeURIComponent(token)}`;
  const message = `Plumbing Market: Your order ${orderId} is ready for pickup. Sign here: ${link}`;

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
        text: `Hi ${name || 'there'},\n\nYour order ${orderId} is ready for pickup at Plumbing Market.\n\nPlease sign the digital receipt here:\n${link}\n\nThank you,\nPlumbing Market`,
        html: `<p>Hi ${name || 'there'},</p><p>Your order <strong>${orderId}</strong> is ready for pickup at Plumbing Market.</p><p><a href="${link}">Sign your pickup receipt</a></p><p>Thank you,<br>Plumbing Market</p>`
      });

      return res.status(200).json({ ok: true, method: 'email', messageId: info.messageId, link });
    }

    // SMS via Aircall
    const aircallToken = process.env.AIRCALL_API_TOKEN;
    const aircallId = process.env.AIRCALL_API_ID;
    if (!aircallToken || !aircallId) {
      return res.status(200).json({ ok: true, method: 'sms-skipped', link, note: 'Aircall not configured' });
    }

    const aircallRes = await fetch('https://api.aircall.io/v1/numbers/' + (process.env.AIRCALL_NUMBER_ID || '') + '/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(aircallId + ':' + aircallToken).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: phone, body: message })
    });

    const aircallData = await aircallRes.json();
    return res.status(200).json({ ok: aircallRes.ok, method: 'sms', link, aircall: aircallData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message, link });
  }
}

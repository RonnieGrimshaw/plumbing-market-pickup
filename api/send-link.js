// Fixed Aircall native send endpoint
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, phone, name } = req.body || {};

  // Normalize phone to E.164
  let to = phone.trim();
  if (!to.startsWith('+')) {
    to = '+1' + to.replace(/\D/g, '');
  }

  const token = `test-${Date.now()}`;
  const link = `https://pickup.plumbingmarket.ca/?token=${token}`;

  const numberId = process.env.AIRCALL_NUMBER_ID;
  const url = `https://api.aircall.io/v1/numbers/${numberId}/messages/native/send`;

  const aircallRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.AIRCALL_API_ID}:${process.env.AIRCALL_API_TOKEN}`).toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to,
      body: `Plumbing Market: Your order is ready for pickup. Sign here: ${link}`
    })
  });

  const aircallData = await aircallRes.json().catch(() => ({}));

  return res.status(200).json({
    ok: aircallRes.ok,
    token,
    link,
    to,
    aircall: aircallData,
    status: aircallRes.status
  });
}

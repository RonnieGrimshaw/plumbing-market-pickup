// Basic token + Aircall SMS stub
// Replace with full Shopify Admin API integration next

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, phone, name } = req.body || {};

  // TODO: generate real cryptographically secure token bound to order
  const token = `test-${Date.now()}`;
  const link = `https://pickup.plumbingmarket.ca/?token=${token}`;

  // Aircall send (uses env vars already set in Vercel)
  const aircallRes = await fetch('https://api.aircall.io/v1/messages/native/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.AIRCALL_API_ID}:${process.env.AIRCALL_API_TOKEN}`).toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number_id: parseInt(process.env.AIRCALL_NUMBER_ID),
      to: phone,
      body: `Plumbing Market: Your order is ready for pickup. Sign here: ${link}`
    })
  });

  const aircallData = await aircallRes.json().catch(() => ({}));

  return res.status(200).json({
    ok: true,
    token,
    link,
    aircall: aircallData
  });
}

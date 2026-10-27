// Receive signature + ID photo submission (stub)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In production: validate token, store files in Shopify Files,
  // write metafields, generate PDF, send email + SMS
  const { token, name, role, signature, idPhoto } = req.body || {};

  console.log('Received submission for token:', token);

  return res.status(200).json({
    ok: true,
    message: 'Pickup verified (stub). Certificate email and SMS would be sent here.'
  });
}

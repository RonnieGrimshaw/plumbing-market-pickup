// Shopify client-credentials token helper
// Gets a short-lived Admin API access token

export async function getShopifyAccessToken() {
  const shop = process.env.SHOPIFY_STORE;
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function shopifyAdminFetch(path, options = {}) {
  const token = await getShopifyAccessToken();
  const shop = process.env.SHOPIFY_STORE;

  const res = await fetch(`https://${shop}/admin/api/2026-10${path}`, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return json;
}

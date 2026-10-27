// Shopify client-credentials + GraphQL helper
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

export async function shopifyGraphql(query, variables = {}) {
  const token = await getShopifyAccessToken();
  const shop = process.env.SHOPIFY_STORE;

  const res = await fetch(`https://${shop}/admin/api/2026-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await res.json();

  if (json.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

// Keep REST helper for non-protected endpoints
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

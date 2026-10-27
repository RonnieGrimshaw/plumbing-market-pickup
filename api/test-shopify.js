// Test endpoint — proves client credentials + Admin API access
import { getShopifyAccessToken, shopifyAdminFetch } from './shopify.js';

export default async function handler(req, res) {
  try {
    const token = await getShopifyAccessToken();

    // Use shop.json — does not require protected customer data approval
    const shop = await shopifyAdminFetch('/shop.json');

    return res.status(200).json({
      ok: true,
      token_preview: token.slice(0, 12) + '...',
      shop_name: shop.shop?.name,
      shop_domain: shop.shop?.myshopify_domain,
      plan: shop.shop?.plan_name
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

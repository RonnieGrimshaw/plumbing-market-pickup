// Test endpoint — proves client credentials + Admin API access
import { getShopifyAccessToken, shopifyAdminFetch } from './shopify.js';

export default async function handler(req, res) {
  try {
    const token = await getShopifyAccessToken();

    // Simple test query: list first 3 orders
    const orders = await shopifyAdminFetch('/orders.json?limit=3&status=any');

    return res.status(200).json({
      ok: true,
      token_preview: token.slice(0, 12) + '...',
      orders_count: orders.orders?.length || 0,
      sample: orders.orders?.map(o => ({
        id: o.id,
        name: o.name,
        fulfillment_status: o.fulfillment_status
      })) || []
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

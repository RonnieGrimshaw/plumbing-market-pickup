// Check if an order has been pickup-verified
import { shopifyGraphql } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const order = req.query.order;
  if (!order) return res.status(400).json({ error: 'Missing order' });

  try {
    let orderName = order.startsWith('#') ? order : '#' + order;

    const query = `
      query Check($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              tags
              note
            }
          }
        }
      }
    `;
    const data = await shopifyGraphql(query, { query: `name:${orderName}` });
    const node = data.orders.edges[0]?.node;

    if (!node) return res.status(404).json({ error: 'Order not found' });

    const verified = (node.tags || []).includes('pickup-verified') || (node.note || '').includes('PICKUP VERIFIED');

    return res.status(200).json({
      ok: true,
      order_name: node.name,
      verified
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

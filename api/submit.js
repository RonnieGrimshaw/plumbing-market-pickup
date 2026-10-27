// Real submit handler — writes order note + tag
import { shopifyAdminFetch } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, signature, idPhoto } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    // Extract order name from token (e.g. test-1001 → #1001)
    let orderName = token;
    if (token.startsWith('test-')) {
      orderName = '#' + token.replace('test-', '');
    } else if (!token.startsWith('#')) {
      orderName = '#' + token;
    }

    // Find the order
    const orders = await shopifyAdminFetch(`/orders.json?name=${encodeURIComponent(orderName)}&status=any&limit=1`);
    const order = orders.orders?.[0];

    if (!order) {
      return res.status(404).json({ error: 'Order not found', looked_for: orderName });
    }

    const orderId = order.id;

    // Write metafield (status)
    try {
      await shopifyAdminFetch(`/orders/${orderId}/metafields.json`, {
        method: 'POST',
        body: JSON.stringify({
          metafield: {
            namespace: 'pickup',
            key: 'status',
            value: 'verified',
            type: 'single_line_text_field'
          }
        })
      });
    } catch (mfErr) {
      console.error('Metafield error:', mfErr.message);
    }

    // Append note + add tag
    const note = `Pickup verified — signed by ${name} (${role || 'self'}) on ${new Date().toISOString()}.`;
    const newNote = order.note ? `${order.note}\n${note}` : note;
    const newTags = order.tags ? `${order.tags},pickup-verified` : 'pickup-verified';

    await shopifyAdminFetch(`/orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        order: {
          id: orderId,
          note: newNote,
          tags: newTags
        }
      })
    });

    return res.status(200).json({
      ok: true,
      order_id: orderId,
      order_name: order.name,
      message: 'Pickup verified and recorded on the order.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

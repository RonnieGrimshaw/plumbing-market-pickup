// Submit using GraphQL (avoids protected customer data REST block)
import { shopifyGraphql } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    // Derive order name
    let orderName = token;
    if (token.startsWith('test-')) {
      orderName = '#' + token.replace('test-', '');
    } else if (!token.startsWith('#')) {
      orderName = '#' + token;
    }

    // Find order by name
    const findQuery = `
      query FindOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              note
              tags
            }
          }
        }
      }
    `;
    const findData = await shopifyGraphql(findQuery, { query: `name:${orderName}` });
    const order = findData.orders.edges[0]?.node;

    if (!order) {
      return res.status(404).json({ error: 'Order not found', looked_for: orderName });
    }

    const note = `Pickup verified — signed by ${name} (${role || 'self'}) on ${new Date().toISOString()}.`;
    const newNote = order.note ? `${order.note}\n${note}` : note;

    // Update note + add tag via orderUpdate
    const updateMutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            name
            note
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateData = await shopifyGraphql(updateMutation, {
      input: {
        id: order.id,
        note: newNote,
        tags: [...(order.tags || []), 'pickup-verified']
      }
    });

    if (updateData.orderUpdate.userErrors?.length) {
      return res.status(400).json({
        ok: false,
        userErrors: updateData.orderUpdate.userErrors
      });
    }

    return res.status(200).json({
      ok: true,
      order_id: order.id,
      order_name: order.name,
      message: 'Pickup verified and recorded on the order.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

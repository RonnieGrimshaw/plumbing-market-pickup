// Submit — stores signature + ID in metafields and writes a clear note
import { shopifyGraphql } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, signature, idPhoto } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    let orderName = token;
    if (token.startsWith('test-')) {
      orderName = '#' + token.replace('test-', '');
    } else if (!token.startsWith('#')) {
      orderName = '#' + token;
    }

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

    // Store signature and ID as multi-line text metafields (data URLs)
    const metafields = [];
    if (signature) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'signature',
        type: 'multi_line_text_field',
        value: signature
      });
    }
    if (idPhoto) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'id_photo',
        type: 'multi_line_text_field',
        value: idPhoto
      });
    }
    metafields.push({
      ownerId: order.id,
      namespace: 'pickup',
      key: 'signer_name',
      type: 'single_line_text_field',
      value: name
    });
    metafields.push({
      ownerId: order.id,
      namespace: 'pickup',
      key: 'signer_role',
      type: 'single_line_text_field',
      value: role || 'self'
    });

    if (metafields.length) {
      const mfMutation = `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key }
            userErrors { field message }
          }
        }
      `;
      await shopifyGraphql(mfMutation, { metafields });
    }

    // Note that creates a timeline entry
    const noteLine = `PICKUP VERIFIED — Signed by ${name} (${role || 'self'}) on ${new Date().toLocaleString()}. Signature and ID photo stored in order metafields (pickup.signature, pickup.id_photo).`;
    const newNote = order.note ? `${order.note}\n${noteLine}` : noteLine;

    const updateMutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id name note tags }
          userErrors { field message }
        }
      }
    `;

    const updateData = await shopifyGraphql(updateMutation, {
      input: {
        id: order.id,
        note: newNote,
        tags: [...new Set([...(order.tags || []), 'pickup-verified'])]
      }
    });

    if (updateData.orderUpdate.userErrors?.length) {
      return res.status(400).json({ ok: false, userErrors: updateData.orderUpdate.userErrors });
    }

    return res.status(200).json({
      ok: true,
      order_name: order.name,
      message: 'Pickup verified. Signature and ID stored in metafields; note added.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

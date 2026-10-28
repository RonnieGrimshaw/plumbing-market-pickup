// Submit — store evidence on order metafield + add note
import { shopifyGraphql } from './shopify.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    token, name, role, signature, idPhoto, items,
    staff, staffNotes, confirmOrderName, authorizedBy, authMethod
  } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    let orderName = token.replace(/[^0-9#]/g, '');
    if (!orderName.startsWith('#')) orderName = '#' + orderName;

    const query = `
      query GetOrder($query: String!) {
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
    const data = await shopifyGraphql(query, { query: `name:${orderName}` });
    const order = data.orders.edges[0]?.node;
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const timestamp = new Date().toISOString();
    const displayTime = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });
    const evidenceHash = crypto.createHash('sha256').update(`${order.name}|${name}|${timestamp}`).digest('hex');

    const evidence = {
      name,
      role: role || 'Self',
      items: items || [],
      staff: staff || null,
      staffNotes: staffNotes || null,
      confirmOrderName: confirmOrderName || null,
      authorizedBy: authorizedBy || null,
      authMethod: authMethod || null,
      timestamp,
      displayTime,
      evidenceHash
    };

    const metafieldMutation = `
      mutation SetEvidence($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;

    const metafields = [{
      ownerId: order.id,
      namespace: 'pickup',
      key: 'evidence',
      type: 'json',
      value: JSON.stringify(evidence)
    }];

    if (signature && signature.startsWith('data:image')) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'signature',
        type: 'multi_line_text_field',
        value: signature
      });
    }

    if (idPhoto && idPhoto.startsWith('data:image')) {
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'id_photo',
        type: 'multi_line_text_field',
        value: idPhoto
      });
    }

    const metaResult = await shopifyGraphql(metafieldMutation, { metafields });
    const metaErrors = metaResult?.metafieldsSet?.userErrors;
    if (metaErrors?.length) {
      console.error('Metafield errors:', JSON.stringify(metaErrors));
    }

    let noteLine = `\n\nPICKUP VERIFIED\nSigned by: ${name} (${role || 'self'})\nTime: ${displayTime}`;
    if (confirmOrderName) noteLine += `\nConfirmed order name: ${confirmOrderName}`;
    if (authorizedBy) noteLine += `\nAuthorized by: ${authorizedBy} (${authMethod || ''})`;
    if (staff) noteLine += `\nStaff: ${staff}`;
    if (staffNotes) noteLine += `\nStaff notes: ${staffNotes}`;
    noteLine += `\nEvidence hash: ${evidenceHash.slice(0, 16)}…`;

    const newNote = order.note ? `${order.note}\n${noteLine}` : noteLine;

    const updateMutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id name }
          userErrors { field message }
        }
      }
    `;

    await shopifyGraphql(updateMutation, {
      input: {
        id: order.id,
        note: newNote,
        tags: [...new Set([...(order.tags || []), 'pickup-verified'])]
      }
    });

    return res.status(200).json({
      ok: true,
      order_name: order.name,
      evidence_hash: evidenceHash,
      id_saved: !!(idPhoto && idPhoto.startsWith('data:image')),
      message: 'Pickup verified. Evidence stored.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}

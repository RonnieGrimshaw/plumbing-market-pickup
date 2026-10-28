// Minimal submit — order note + tag only (PDF disabled temporarily)
import { shopifyGraphql } from './shopify.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, name, role, staff, staffNotes, confirmOrderName, authorizedBy, authMethod } = req.body || {};

  if (!token || !name) {
    return res.status(400).json({ error: 'Missing token or name' });
  }

  try {
    let orderName = token.replace(/[^0-9#]/g, '');
    if (!orderName.startsWith('#')) orderName = '#' + orderName;

    const findQuery = `
      query FindOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node { id name note tags }
          }
        }
      }
    `;
    const findData = await shopifyGraphql(findQuery, { query: `name:${orderName}` });
    const order = findData.orders.edges[0]?.node;

    if (!order) {
      return res.status(404).json({ error: 'Order not found', looked_for: orderName });
    }

    const timestamp = new Date().toISOString();
    const displayTime = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });
    const evidenceHash = crypto.createHash('sha256').update(`${order.name}|${name}|${timestamp}`).digest('hex');

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
      evidence_hash: evidenceHash,
      message: 'Pickup verified. Note added to order.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}

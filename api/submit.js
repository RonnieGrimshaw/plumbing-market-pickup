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

    // Store evidence for the PDF certificate
    const evidence = {
      name,
      role: role || 'Self',
      signature: signature || null,
      idPhoto: idPhoto || null,
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

    // Store evidence — keep ID photo separate so it doesn't get truncated
    const evidenceForStore = { ...evidence };
    delete evidenceForStore.idPhoto;
    // Keep a copy of the signature in the evidence JSON as well as the separate metafield
    if (signature && signature.startsWith('data:image') && signature.length < 60000) {
      evidenceForStore.signature = signature;
    } else {
      delete evidenceForStore.signature;
    }

    const metafields = [
      {
        ownerId: order.id,
        namespace: 'pickup',
        key: 'evidence',
        type: 'json',
        value: JSON.stringify(evidenceForStore)
      }
    ];

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
      // Keep existing metafield storage
      metafields.push({
        ownerId: order.id,
        namespace: 'pickup',
        key: 'id_photo',
        type: 'multi_line_text_field',
        value: idPhoto
      });

      // Also upload as a Shopify file so the PDF can load a clean image
      try {
        const fileUrl = await uploadIdToShopify(idPhoto, order.name);
        if (fileUrl) {
          metafields.push({
            ownerId: order.id,
            namespace: 'pickup',
            key: 'id_photo_url',
            type: 'single_line_text_field',
            value: fileUrl
          });
        }
      } catch (e) {
        console.error('ID file upload failed:', e.message);
      }
    }

    const metaResult = await shopifyGraphql(metafieldMutation, { metafields });
    const metaErrors = metaResult?.metafieldsSet?.userErrors;
    if (metaErrors?.length) {
      console.error('Metafield errors:', JSON.stringify(metaErrors));
    }

    // Order note
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
      message: 'Pickup verified. Evidence stored.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server error' });
  }
}

async function uploadIdToShopify(dataUrl, orderName) {
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) return null;

  const filename = `id-${(orderName || 'order').replace('#', '')}-${Date.now()}.jpg`;

  const staged = await shopifyGraphql(`
    mutation Staged($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }
  `, {
    input: [{
      resource: 'FILE',
      filename,
      mimeType: 'image/jpeg',
      httpMethod: 'POST',
      fileSize: String(bytes.length)
    }]
  });

  const target = staged?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url) return null;

  const form = new FormData();
  for (const p of target.parameters || []) form.append(p.name, p.value);
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), filename);

  const uploadRes = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadRes.ok) return null;

  const created = await shopifyGraphql(`
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { ... on MediaImage { image { url } } }
        userErrors { message }
      }
    }
  `, { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', filename }] });

  return created?.fileCreate?.files?.[0]?.image?.url || target.resourceUrl;
}
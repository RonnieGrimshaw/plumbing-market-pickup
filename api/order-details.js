// Returns order items that are ready for pickup
import { shopifyGraphql } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.query.token || req.body?.token;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    let orderName = token;
    if (token.startsWith('test-')) {
      orderName = '#' + token.replace('test-', '');
    } else if (!token.startsWith('#')) {
      orderName = '#' + token;
    }

    const query = `
      query OrderDetails($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              phone
              customer {
                email
                phone
                firstName
                lastName
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    name
                    title
                    variantTitle
                    sku
                    quantity
                    image { url altText }
                    variant { image { url } }
                  }
                }
              }
              fulfillments(first: 20) {
                id
                status
                displayStatus
                fulfillmentLineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      lineItem {
                        id
                        name
                        title
                        variantTitle
                        sku
                        image { url }
                      }
                    }
                  }
                }
              }
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

    let readyItems = [];
    for (const f of order.fulfillments || []) {
      if (f.displayStatus === 'READY_FOR_PICKUP' || f.displayStatus === 'PICKED_UP') {
        for (const edge of f.fulfillmentLineItems.edges) {
          const li = edge.node.lineItem;
          readyItems.push({
            id: li.id,
            name: li.name || li.title,
            title: li.title,
            variantTitle: li.variantTitle,
            sku: li.sku,
            quantity: edge.node.quantity,
            image: li.image?.url || null
          });
        }
      }
    }

    if (readyItems.length === 0) {
      readyItems = order.lineItems.edges.map(e => ({
        id: e.node.id,
        name: e.node.name || e.node.title,
        title: e.node.title,
        variantTitle: e.node.variantTitle,
        sku: e.node.sku,
        quantity: e.node.quantity,
        image: e.node.image?.url || e.node.variant?.image?.url || null
      }));
    }

    return res.status(200).json({
      ok: true,
      order_name: order.name,
      email: order.email || order.customer?.email || null,
      phone: order.phone || order.customer?.phone || null,
      customer_name: order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() : null,
      items: readyItems
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

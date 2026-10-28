// Create a simple test LOCAL PICKUP order
import { shopifyAdminFetch } from './shopify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const order = {
      order: {
        line_items: [
          {
            title: 'Test Copper Elbow',
            quantity: 2,
            price: '12.50'
          },
          {
            title: 'Test Copper Tube',
            quantity: 1,
            price: '24.00'
          }
        ],
        shipping_address: {
          first_name: req.body?.firstName || 'Klein',
          last_name: req.body?.lastName || 'Customer',
          address1: '131 Whitmore Rd',
          city: 'Vaughan',
          province: 'Ontario',
          country: 'Canada',
          zip: 'L4L 6E3'
        },
        email: req.body?.email || 'klein@plumbingmarket.ca',
        financial_status: 'paid',
        fulfillment_status: null,
        note: 'TEST ORDER — Local pickup verification',
        tags: 'local-pickup,test'
      }
    };

    const result = await shopifyAdminFetch('/orders.json', {
      method: 'POST',
      body: JSON.stringify(order)
    });

    return res.status(200).json({
      ok: true,
      order_id: result.order?.id,
      order_name: result.order?.name,
      message: 'Test order created'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

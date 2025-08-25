// /api/checkout-session.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    // Obtenemos los datos completos de la sesión
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent', 'line_items'],
    });

    return res.status(200).json(session);
  } catch (err) {
    console.error("❌ Error al recuperar session:", err);
    return res.status(500).json({ error: 'Failed to retrieve checkout session', details: err?.message || String(err) });
  }
}

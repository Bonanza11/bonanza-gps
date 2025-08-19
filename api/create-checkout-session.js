// /api/create-checkout-session.js  (Vercel serverless - Node 18+)
// Requiere env: STRIPE_SECRET_KEY = sk_live_...

const Stripe = require('stripe');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe secret key is missing' });
  }

  try {
    const {
      amount, // en centavos
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    // Validación monto ($50–$2000)
    const cents = Number(amount);
    if (!Number.isInteger(cents) || cents < 5000 || cents > 200000) {
      return res.status(400).json({ error: 'Invalid amount (must be between $50 and $2000)' });
    }

    const meta = {
      fullname: fullname || '',
      phone: phone || '',
      email: email || '',
      pickup: pickup || '',
      dropoff: dropoff || '',
      date: date || '',
      time: time || '',
      flightNumber: flightNumber || '',
      flightOriginCity: flightOriginCity || '',
      tailNumber: tailNumber || '',
      privateFlightOriginCity: privateFlightOriginCity || '',
      vehicleType: vehicleType || '',
      distanceMiles: String(distanceMiles ?? ''),
      quotedTotal: String(quotedTotal ?? ''),
      confirmationNumber: confirmationNumber || '',
    };

    // Origin dinámico (sirve en previews y prod)
    const origin =
      req.headers.origin ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://bonanza-gps.vercel.app');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Bonanza Transportation Ride' },
          unit_amount: cents,
        },
        quantity: 1,
      }],
      customer_email: email || undefined,
      success_url: `${origin}/success`,
      cancel_url:  `${origin}/cancel`,
      metadata: meta,
      payment_intent_data: { metadata: meta },
      // allow_promotion_codes: true,
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Stripe ERROR:', err?.type, err?.message);
    return res.status(500).json({
      error: `Stripe session failed: ${err?.message || 'unknown error'}`
    });
  }
};

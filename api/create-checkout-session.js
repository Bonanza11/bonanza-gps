// /api/create-checkout-session.js
// Vercel serverless function (Node 18+)
// Requiere env: STRIPE_SECRET_KEY = sk_live_...

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const {
      amount, // en CENTAVOS (p.ej. 12345 = $123.45)
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    // Validación básica del monto
    const cents = Number(amount);
    if (!Number.isInteger(cents) || cents < 5000 || cents > 200000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Metadatos (Stripe: máx. ~50 pares, valor <= 500 chars)
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Bonanza Transportation Ride' },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],

      // Recibos / autocompletar correo
      customer_email: email || undefined,

      // URLs (cámbialas si tienes dominio propio)
      success_url: 'https://bonanza-gps.vercel.app/success',
      cancel_url:  'https://bonanza-gps.vercel.app/cancel',

      // Metadatos en la sesión (útiles para referencia)
      metadata: meta,

      // 👉 Propaga metadatos al PaymentIntent (para verlos en el pago/cargo)
      payment_intent_data: {
        metadata: meta,
      },

      // Opcional: permitir cupones si algún día los usas
      // allow_promotion_codes: true,
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Stripe ERROR:', err);
    return res.status(500).json({ error: 'Stripe session failed' });
  }
}

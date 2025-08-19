// /api/create-checkout-session.js
// Vercel serverless function (Node 18+)
// Requiere variable de entorno: STRIPE_SECRET_KEY = sk_live_...

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Solo permitimos POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // Datos que envía el front
    const {
      amount, // EN CENTAVOS (p.ej. 12345 = $123.45)

      // Metadatos opcionales para tu panel de Stripe
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    // Validación básica del monto (ajusta límites si quieres)
    const cents = Number(amount);
    if (!Number.isInteger(cents) || cents < 5000 || cents > 200000) {
      // ejemplo: mínimo $50, máximo $2,000
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Crear sesión de Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Bonanza Transportation Ride',
            },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],

      // 🚨 Cambia estas URLs si usas dominio propio
      success_url: 'https://bonanza-gps.vercel.app/success',
      cancel_url:  'https://bonanza-gps.vercel.app/cancel',

      // Metadatos para reconciliar reservas en el Dashboard
      metadata: {
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
      },
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Stripe ERROR:', err);
    return res.status(500).json({ error: 'Stripe session failed' });
  }
}

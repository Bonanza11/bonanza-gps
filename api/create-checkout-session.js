// /api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const {
      amount,
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    // Validación básica
    const cents = Number(amount);
    if (!Number.isInteger(cents) || cents < 5000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

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
      customer_email: email || undefined,
      success_url: 'https://bonanza-gps.vercel.app/success',
      cancel_url: 'https://bonanza-gps.vercel.app/cancel',
      metadata: {
        fullname, phone, email,
        pickup, dropoff, date, time,
        flightNumber, flightOriginCity,
        tailNumber, privateFlightOriginCity,
        vehicleType,
        distanceMiles: String(distanceMiles ?? ''),
        quotedTotal: String(quotedTotal ?? ''),
        confirmationNumber: confirmationNumber || '',
      }
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Stripe ERROR:', err);
    return res.status(500).json({ error: 'Stripe session failed' });
  }
}

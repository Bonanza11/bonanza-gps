import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    console.log("👉 Body recibido:", req.body);

    const {
      amount,
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    const cents = Number(amount);
    if (!Number.isInteger(cents) || cents < 5000) {
      console.error("❌ Monto inválido:", cents);
      return res.status(400).json({ error: 'Invalid amount' });
    }

    console.log("✅ Creando sesión con:", { cents, email });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Bonanza Transportation Ride' },
          unit_amount: cents,
        },
        quantity: 1,
      }],
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

    console.log("✅ Sesión creada:", session.id);
    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error("❌ Stripe ERROR:", err);
    // devuelve el detalle para depurar desde el cliente (temporal)
    return res.status(500).json({ error: 'Stripe session failed', details: err?.message || String(err) });
  }
}

// /api/create-checkout-session.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // ----- Body esperado -----
    // amount          -> en CENTAVOS (integer). Ej: $1.00 => 100
    // fullname, phone, email, pickup, dropoff, date, time, ...
    // confirmationNumber -> tu CN (lo usaremos en la URL de success)
    const {
      amount,
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal, confirmationNumber
    } = req.body || {};

    // === Validación de monto: permitir $1+ (100 centavos) ===
    const cents = Number.parseInt(amount, 10);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'Invalid amount (must be positive integer cents)' });
    }

    // Armamos URLs dinámicas y pasamos CN + session_id
    const origin = req.headers.origin || 'https://bonanza-gps.vercel.app';
    const cn = confirmationNumber || '';
    const successUrl = `${origin}/reschedule-success.html?cn=${encodeURIComponent(cn)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/reschedule.html?cn=${encodeURIComponent(cn)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: cents, // << ya viene en centavos
          product_data: { name: `Bonanza Transportation — ${cn || 'Reschedule'}` }
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
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
        confirmationNumber: cn,
        kind: 'reschedule_or_full'
      }
    });

    return res.status(200).json({ ok: true, id: session.id, url: session.url });
  } catch (err) {
    console.error("❌ Stripe ERROR:", err);
    return res.status(500).json({ error: 'Stripe session failed', details: err?.message || String(err) });
  }
}

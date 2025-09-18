// /api/create-checkout-session.js
export const config = { runtime: "nodejs" };

import Stripe from "stripe";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  throw new Error("[create-checkout-session] Missing STRIPE_SECRET_KEY");
}
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// Fallback para URLs absolutas si no viene req.headers.origin
const SITE_URL =
  process.env.SITE_URL ||    // ej: https://bonanza-gps.vercel.app
  process.env.NEXT_PUBLIC_SITE_URL ||
  null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      amount,                                // entero en centavos
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType, distanceMiles, quotedTotal,
      confirmationNumber
    } = req.body || {};

    // Validación del monto
    const cents = Number.parseInt(amount, 10);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: "Invalid amount (must be positive integer cents)" });
    }

    // Armado de URLs
    const origin = req.headers.origin || SITE_URL;
    if (!origin) {
      return res.status(400).json({ error: "Missing origin/SITE_URL for redirect URLs" });
    }
    const cn = confirmationNumber || "";
    const success_url = `${origin}/reschedule-success.html?cn=${encodeURIComponent(cn)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${origin}/reschedule.html?cn=${encodeURIComponent(cn)}`;

    // Sesión de checkout
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: cents, // ya en centavos
          product_data: { name: `Bonanza Transportation — ${cn || "Reschedule"}` }
        },
        quantity: 1
      }],
      success_url,
      cancel_url,
      metadata: {
        fullname: fullname || "",
        phone: phone || "",
        email: email || "",
        pickup: pickup || "",
        dropoff: dropoff || "",
        date: date || "",
        time: time || "",
        flightNumber: flightNumber || "",
        flightOriginCity: flightOriginCity || "",
        tailNumber: tailNumber || "",
        privateFlightOriginCity: privateFlightOriginCity || "",
        vehicleType: vehicleType || "",
        distanceMiles: String(distanceMiles ?? ""),
        quotedTotal: String(quotedTotal ?? ""),
        confirmationNumber: cn,
        kind: "reschedule_or_full"
      }
      // optional: automatic_tax: { enabled: true }
    });

    return res.status(200).json({ ok: true, id: session.id, url: session.url });
  } catch (err) {
    console.error("❌ Stripe ERROR:", err);
    return res.status(500).json({ error: "Stripe session failed", details: err?.message || String(err) });
  }
}

// /api/create-checkout-session.js
import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";

export const config = { runtime: "nodejs" };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function requireIntCents(v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount (must be positive integer cents)");
  }
  return n;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    // ——— Body esperado ———
    const {
      amount, // CENTAVOS (integer)
      fullname, phone, email,
      pickup, dropoff, date, time,
      flightNumber, flightOriginCity,
      tailNumber, privateFlightOriginCity,
      vehicleType,
      distanceMiles, quotedTotal,
      confirmationNumber, // CN obligatorio para enlazar booking
    } = body || {};

    if (!confirmationNumber || typeof confirmationNumber !== "string") {
      return res.status(400).json({ error: "Missing confirmationNumber" });
    }
    const cents = requireIntCents(amount);

    const origin = req.headers.origin || "https://bonanza-gps.vercel.app";
    const cn = confirmationNumber.trim();

    // PÁGINA DE ÉXITO ESPECÍFICA PARA REPROGRAMA (tu nueva página)
    const successUrl = `${origin}/reschedule-payment-success.html?cn=${encodeURIComponent(cn)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/reschedule.html?cn=${encodeURIComponent(cn)}`;

    // Idempotencia: evita crear 2 sesiones si el cliente hace doble submit
    const idemKey = `resched:${cn}:${cents}:${Date.now()}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: email || undefined,
        payment_method_types: ["card"],
        allow_promotion_codes: false,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: cents,
              product_data: {
                name: `Bonanza Transportation — ${cn || "Reschedule"}`,
                description: "Reschedule price adjustment",
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          kind: "RESCHEDULE",
          cn,                           // 👈 corto y consistente
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
        },
      },
      { idempotencyKey: idemKey }
    );

    // (OPCIONAL) guarda el session id en DB si tienes DATABASE_URL configurada
    try {
      if (process.env.DATABASE_URL) {
        const sql = neon(process.env.DATABASE_URL);
        await sql`
          update bookings
          set stripe_session_id = ${session.id}, updated_at = NOW()
          where confirmation_number = ${cn}
        `;
      }
    } catch (e) {
      // No rompas el flujo por un fallo de guardado opcional
      console.warn("Could not persist session id:", e?.message || e);
    }

    return res.status(200).json({ ok: true, id: session.id, url: session.url });
  } catch (err) {
    console.error("❌ Stripe ERROR:", err);
    return res.status(500).json({ error: "Stripe session failed", details: err?.message || String(err) });
  }
}

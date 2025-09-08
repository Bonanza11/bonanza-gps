// /api/create-checkout-session-diff.js
// Crea una sesión de Stripe para cobrar la DIFERENCIA de una reserva reprogramada.
// Body esperado (JSON):
// {
//   "cn": "BZ-20250110-ABCD",
//   "difference": 42.50,              // importe a cobrar (USD), DEBE ser > 0
//   "email": "cliente@ejemplo.com",   // opcional: prefill en Checkout
//   "fullname": "John Doe",           // opcional: metadata
//   "phone": "(555) 123-4567",        // opcional: metadata
//   "pickup": "SLC Airport",          // opcional: metadata
//   "dropoff": "Deer Valley",         // opcional: metadata
//   "date": "2025-07-04",             // opcional: metadata (nueva fecha)
//   "time": "14:30",                  // opcional: metadata (nueva hora)
//   "vehicleType": "SUV",             // opcional: metadata
//   "originalTotal": 199.00,          // opcional: metadata (ayuda en HQ)
//   "newTotal": 241.50                // opcional: metadata (ayuda en HQ)
// }
//
// Respuesta: { ok:true, id:"cs_test_...", url:"https://checkout.stripe.com/..." }


import Stripe from "stripe";

export const config = { runtime: "nodejs" }; // evita edge runtime

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function isNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}
function toCents(usd) {
  return Math.round(Number(usd) * 100);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ ok: false, error: "missing_stripe_secret_key" });
  }

  try {
    // Asegurar body JSON
    let body = req.body;
    if (!body || typeof body !== "object") {
      const raw = await new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(data));
      });
      try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
    }

    const {
      cn,
      difference,           // USD (ej. 42.50)
      email,
      fullname,
      phone,
      pickup,
      dropoff,
      date,
      time,
      vehicleType,
      originalTotal,
      newTotal,
    } = body || {};

    if (!cn || typeof cn !== "string") {
      return res.status(400).json({ ok: false, error: "missing_cn" });
    }
    if (!isNumber(difference)) {
      return res.status(400).json({ ok: false, error: "invalid_difference" });
    }
    if (difference <= 0) {
      return res.status(400).json({ ok: false, error: "non_positive_difference" });
    }

    const amount_cents = toCents(difference);

    // Idempotency para evitar sesiones duplicadas si el cliente reintenta muy rápido
    const idemKey = `diff:${cn}:${amount_cents}:${Date.now()}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // Prefill de email en la pantalla de Stripe (opcional)
        customer_email: email && String(email).trim() ? String(email).trim() : undefined,

        payment_method_types: ["card"],
        allow_promotion_codes: false,

        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Reservation Price Difference",
                description: `CN ${cn} — reschedule adjustment`,
              },
              unit_amount: amount_cents,
            },
            quantity: 1,
          },
        ],

        // Redirecciones
        success_url: `${req.headers.origin || "https://bonanza.example"}/success?kind=diff&cn=${encodeURIComponent(cn)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || "https://bonanza.example"}/cancel?kind=diff&cn=${encodeURIComponent(cn)}`,

        // Metadata (muy útil para el webhook y HQ)
        metadata: {
          kind: "DIFF",
          cn,
          difference_usd: String(difference),
          email: email || "",
          fullname: fullname || "",
          phone: phone || "",
          pickup: pickup || "",
          dropoff: dropoff || "",
          date: date || "",
          time: time || "",
          vehicleType: vehicleType || "",
          originalTotal: isNumber(originalTotal) ? String(originalTotal) : "",
          newTotal: isNumber(newTotal) ? String(newTotal) : "",
        },
      },
      { idempotencyKey: idemKey }
    );

    return res.json({ ok: true, id: session.id, url: session.url });
  } catch (err) {
    console.error("[/api/create-checkout-session-diff] error:", err);
    const code = err?.statusCode || err?.status || 500;
    return res.status(code).json({
      ok: false,
      error: "stripe_error",
      detail: String(err?.message || err),
    });
  }
}

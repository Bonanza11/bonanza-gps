// /api/checkout-session.js
export const config = { runtime: "nodejs" };

import Stripe from "stripe";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  throw new Error("[checkout-session] Missing STRIPE_SECRET_KEY");
}

// Fija apiVersion para resultados estables
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const session_id = String(req.query.session_id || "").trim();

  // Validación simple del id de sesión de Stripe
  if (!session_id || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(session_id)) {
    return res.status(400).json({ error: "invalid_session_id" });
  }

  try {
    // Recupera la sesión y expande lo necesario
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent", "line_items.data.price.product"],
    });

    // Respuesta “minimizada” (evita exponer todo el objeto)
    const out = {
      id: session.id,
      mode: session.mode,
      status: session.status,                // 'open' | 'complete' | 'expired'
      payment_status: session.payment_status, // 'paid' | ...
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || null,
      created: session.created,
      payment_intent: session.payment_intent
        ? {
            id: session.payment_intent.id,
            status: session.payment_intent.status,
            amount: session.payment_intent.amount,
          }
        : null,
      line_items: (session.line_items?.data || []).map(li => ({
        id: li.id,
        quantity: li.quantity,
        amount_subtotal: li.amount_subtotal,
        amount_total: li.amount_total,
        description:
          li.description ||
          li.price?.product?.name ||
          li.price?.nickname ||
          null,
      })),
    };

    return res.status(200).json({ ok: true, session: out });
  } catch (err) {
    // Maneja errores específicos de Stripe si vienen
    const code = err?.statusCode || 500;
    console.error("[checkout-session] error:", err);
    return res.status(code).json({
      ok: false,
      error: "stripe_error",
      detail: process.env.NODE_ENV === "production" ? undefined : err?.message,
    });
  }
}

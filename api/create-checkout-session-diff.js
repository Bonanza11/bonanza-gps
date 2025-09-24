// /api/create-checkout-session-diff.js
export const config = { runtime: "nodejs" };

import Stripe from "stripe";
import crypto from "crypto";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  throw new Error("[create-checkout-session-diff] Missing STRIPE_SECRET_KEY");
}
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// URL base para redirecciones (fallback a Origin del request)
const SITE_URL_ENV =
  process.env.SITE_URL || // p.ej. https://bonanza-gps-1dr1.vercel.app
  process.env.NEXT_PUBLIC_SITE_URL ||
  null;

// Util
const isValidCN = (s) => /^[A-Z0-9-]{4,40}$/.test(String(s || "").trim().toUpperCase());
const isInt = (n) => Number.isInteger(n);

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const {
      cn,                 // Confirmation Number
      diffAmount,         // entero en centavos (p.ej. 2599 = $25.99)
      customerEmail,      // opcional, prellenado en checkout
      metadata = {},      // opcional, se mergea con { cn, type }
      description,        // opcional
      currency = "usd"    // opcional, default USD
    } = req.body || {};

    // ===== Validaciones =====
    const cleanCN = String(cn || "").trim().toUpperCase();
    if (!isValidCN(cleanCN)) {
      return res.status(400).json({ ok: false, error: "Invalid confirmation number (cn)" });
    }

    const amount = Number(diffAmount);
    if (!isInt(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: "diffAmount must be an integer > 0 (cents)" });
    }

    const origin =
      SITE_URL_ENV ||
      (req.headers.origin && String(req.headers.origin).startsWith("http") ? req.headers.origin : null);

    if (!origin) {
      return res.status(500).json({
        ok: false,
        error: "Missing SITE_URL / NEXT_PUBLIC_SITE_URL and request Origin; cannot build redirect URLs"
      });
    }

    const successUrl = `${origin}/app/reschedule.html?cn=${encodeURIComponent(cleanCN)}&status=success`;
    const cancelUrl  = `${origin}/app/reschedule.html?cn=${encodeURIComponent(cleanCN)}&status=cancel`;

    // Descripción por defecto
    const lineDesc =
      description || `Reschedule difference for ${cleanCN}`;

    // Metadata consolidado (evita que sobrescriban cn/type)
    const meta = {
      ...metadata,
      cn: cleanCN,
      type: "reschedule_diff"
    };

    // Idempotency key (misma cn+amount en 2s evita sesiones duplicadas)
    const idemKey = `resched:${cleanCN}:${amount}:${Date.now().toString().slice(0, -3)}`;

    // ===== Crear Checkout Session =====
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: customerEmail || undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amount,
              product_data: {
                name: `Reschedule difference`,
                description: lineDesc,
                metadata: meta
              }
            }
          }
        ],
        payment_intent_data: {
          metadata: meta
        },
        metadata: meta,
        // opcional: recoger dirección si lo necesitas
        // billing_address_collection: "required",
        // automatic_tax: { enabled: true },
      },
      { idempotencyKey: crypto.createHash("sha256").update(idemKey).digest("hex") }
    );

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (err) {
    console.error("[create-checkout-session-diff]", err);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

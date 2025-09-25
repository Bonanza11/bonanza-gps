// /api/create-checkout-session-diff.js
export const config = { runtime: "nodejs" };

import Stripe from "stripe";
import crypto from "crypto";

// ==== ENV ====
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  throw new Error("[create-checkout-session-diff] Missing STRIPE_SECRET_KEY");
}
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// URL base para redirecciones (si no, usa Origin del request)
const SITE_URL_ENV =
  process.env.SITE_URL ||        // p.ej. https://bonanza-gps.vercel.app
  process.env.NEXT_PUBLIC_SITE_URL ||
  null;

// ==== Utils ====
const isValidCN = (s) => /^[A-Z0-9-]{4,40}$/.test(String(s || "").trim().toUpperCase());
const isInt = (n) => Number.isInteger(n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
const ALLOWED_CURRENCIES = new Set(["usd"]);

function getOrigin(req) {
  if (SITE_URL_ENV) return SITE_URL_ENV;
  const hdr = String(req.headers.origin || "");
  return hdr.startsWith("http") ? hdr : null;
}

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
      cn,                 // Confirmation Number (obligatorio)
      diffAmount,         // entero en centavos (>0)
      customerEmail,      // opcional, pre-llenado en Checkout
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

    const cur = String(currency || "usd").toLowerCase();
    if (!ALLOWED_CURRENCIES.has(cur)) {
      return res.status(400).json({ ok: false, error: "Unsupported currency" });
    }

    const origin = getOrigin(req);
    if (!origin) {
      return res.status(500).json({
        ok: false,
        error: "Missing SITE_URL / NEXT_PUBLIC_SITE_URL and request Origin; cannot build redirect URLs"
      });
    }

    const successUrl = `${origin}/app/reschedule.html?cn=${encodeURIComponent(cleanCN)}&status=success`;
    const cancelUrl  = `${origin}/app/reschedule.html?cn=${encodeURIComponent(cleanCN)}&status=cancel`;

    // Descripción por defecto
    const lineDesc = description || `Reschedule difference for ${cleanCN}`;

    // Metadata consolidado (protegemos cn/type)
    const meta = {
      ...metadata,
      cn: cleanCN,
      type: "reschedule_diff"
    };

    // Idempotency key determinística (mismo CN + amount ⇒ misma sesión si se reintenta)
    // Si quieres que cada intento genere sesión nueva, añade un sufijo timestamp.
    const idemRaw = `resched|${cleanCN}|${amount}|${cur}`;
    const idempotencyKey = crypto.createHash("sha256").update(idemRaw).digest("hex");

    // ===== Crear Checkout Session =====
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: cleanCN,
        customer_email: isEmail(customerEmail) ? customerEmail : undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: cur,
              unit_amount: amount,
              product_data: {
                name: "Reschedule difference",
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
        // Si necesitas dirección de facturación o impuestos:
        // billing_address_collection: "required",
        // automatic_tax: { enabled: true },
      },
      { idempotencyKey }
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

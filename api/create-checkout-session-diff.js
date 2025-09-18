// /api/create-checkout-session-diff.js
export const config = { runtime: "nodejs" };

import Stripe from "stripe";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  throw new Error("[create-checkout-session-diff] Missing STRIPE_SECRET_KEY");
}
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// URL base para las redirecciones (fallback si no viene req.headers.origin)
const SITE_URL =
  process.env.SITE_URL || // e.g. https://bonanza-gps.vercel.app
  process.env.NEXT_PUBLIC_SITE_URL ||
  null;

export default async function handler(req, res) {
  // CORS básico
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
      cn,
      diffAmount,              // entero en centavos
      customerEmail,
      metadata = {},
      description,
    } = req.body || {};

    // Validaciones
    const

// /api/ping.js  (temporal de diagnóstico)
export default function handler(req, res) {
  const k = process.env.STRIPE_SECRET_KEY || "";
  res.json({
    ok: Boolean(k),
    mode: k.startsWith("sk_live_") ? "live" : k.startsWith("sk_test_") ? "test" : "unknown",
    prefix: k ? k.slice(0, 7) : null,     // p.ej. "sk_live"
    last4:  k ? k.slice(-4) : null,       // compara con Stripe
    len:    k.length
  });
}

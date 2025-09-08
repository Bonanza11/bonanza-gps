// /api/checkout-session.js
import Stripe from "stripe";
export const config = { runtime: "nodejs" }; // evita edge
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    // ========== CREAR (POST) ==========
    if (req.method === "POST") {
      const {
        reservation_id,              // <-- ID de tu tabla reservations (OBLIGATORIO)
        customer_email,              // opcional (Stripe envía recibo)
        amount_cents,                // <-- ej: 12000 = $120.00 (OBLIGATORIO)
        currency = "usd",
        description = "Bonanza reservation",
        success_url,                 // <-- URL a la que volver tras pagar (OBLIGATORIO)
        cancel_url                   // <-- URL si cancela (OBLIGATORIO)
      } = req.body || {};

      if (!reservation_id || !amount_cents || !success_url || !cancel_url) {
        return res.status(400).json({ ok:false, error:"missing_fields" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: customer_email || undefined,
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount_cents,
            product_data: { name: "Private Transportation", description }
          }
        }],
        metadata: { reservation_id },     // 👈 IMPORTANTE para el webhook
        success_url,
        cancel_url
      });

      return res.json({ ok:true, id: session.id, url: session.url });
    }

    // ========== OBTENER (GET) ==========
    if (req.method === "GET") {
      const { session_id } = req.query;
      if (!session_id) return res.status(400).json({ ok:false, error:"missing_session_id" });

      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["payment_intent", "line_items"],
      });

      return res.json({ ok:true, session });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  } catch (err) {
    console.error("[/api/checkout-session] ", err);
    return res.status(500).json({ ok:false, error:"server_error", detail:String(err?.message||err) });
  }
}

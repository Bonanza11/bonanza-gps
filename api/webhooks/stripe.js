// /api/webhooks/stripe.js
import Stripe from "stripe";
import { buffer } from "micro";
import { query } from "../_db.js";           // tu helper de DB
import { sendEmail } from "../email/send.js";

export const config = {
  api: { bodyParser: false },                // Stripe necesita RAW body
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// normaliza CN: guiones raros → "-", quita basura, mayúsculas
function normalizeCN(v = "") {
  return v
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[^\w-]/g, "")
    .toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object; // Stripe.Checkout.Session

      const kind = (s.metadata?.kind || "").toUpperCase(); // "BOOKING" o "RESCHEDULE"
      const cn   = normalizeCN(s.metadata?.cn || "");
      const email = s.customer_details?.email || s.customer_email || "";
      const amountCents = Number(s.amount_total ?? 0);
      const currency = (s.currency || "usd").toUpperCase();
      const paymentIntent = s.payment_intent || "";
      const sessionId = s.id;

      if (!cn) {
        console.warn("⚠️ checkout.session.completed sin CN en metadata");
        // no devolvemos error a Stripe; simplemente registramos
      } else {
        // Actualiza bookings: marca como pagado y guarda datos del cobro
        // Si es RESCHEDULE guarda el monto de diferencia en otro campo (si lo tienes).
        if (kind === "RESCHEDULE") {
          await query(
            `
            UPDATE bookings
               SET status = 'PAID',
                   reschedule_last_paid_cents = $2,
                   stripe_payment_intent = $3,
                   stripe_session_id = $4,
                   currency = $5,
                   updated_at = now()
             WHERE confirmation_number = $1
            `,
            [cn, amountCents || null, String(paymentIntent || ""), String(sessionId || ""), currency]
          );
        } else {
          // BOOKING inicial (o sin kind)
          await query(
            `
            UPDATE bookings
               SET status = 'PAID',
                   amount_paid_cents = $2,
                   stripe_payment_intent = $3,
                   stripe_session_id = $4,
                   currency = $5,
                   updated_at = now()
             WHERE confirmation_number = $1
            `,
            [cn, amountCents || null, String(paymentIntent || ""), String(sessionId || ""), currency]
          );
        }
      }

      // Email de confirmación (solo si tenemos email)
      if (email) {
        const subject =
          kind === "RESCHEDULE"
            ? "✅ Reschedule confirmado — Bonanza Transportation"
            : "✅ Reserva confirmada — Bonanza Transportation";

        const bodyHtml =
          kind === "RESCHEDULE"
            ? `
              <h1>Reschedule confirmado</h1>
              <p>Tu reprogramación se ha procesado correctamente.</p>
              <p><b>CN:</b> ${cn || "N/A"} · <b>Monto:</b> $${(amountCents / 100).toFixed(2)} ${currency}</p>
            `
            : `
              <h1>Reserva confirmada</h1>
              <p>Gracias por tu pago. Tu viaje ha sido confirmado.</p>
              <p><b>CN:</b> ${cn || "N/A"} · <b>Monto:</b> $${(amountCents / 100).toFixed(2)} ${currency}</p>
            `;

        try {
          await sendEmail({ to: email, subject, html: bodyHtml });
        } catch (e) {
          console.warn("✉️ Email send failed:", e?.message || e);
        }
      }

      console.log("✔ checkout.session.completed handled:", { kind, cn, email });
    }

    // Devuelve 200 a Stripe lo más rápido posible
    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler failed:", err);
    res.status(500).send("Webhook handler failed");
  }
}

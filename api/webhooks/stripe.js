// /api/webhooks/stripe.js
import Stripe from "stripe";
import { buffer } from "micro";
import { query } from "../_db.js";   // ajusta si tu _db.js está en otra ruta
import { sendEmail } from "../email/send.js"; // reutilizamos tu función de email

export const config = {
  api: {
    bodyParser: false, // Stripe requiere el raw body
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    console.error("❌ Error verificando firma de Stripe:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ---- Procesar eventos ----
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // ID de la reserva que guardaste cuando creaste la sesión
      const reservaId = session.metadata?.reservation_id;
      const email = session.customer_details?.email;

      // 1) Actualiza la DB
      if (reservaId) {
        await query(
          `UPDATE reservations
           SET status = 'PAID', updated_at = now()
           WHERE id = $1`,
          [reservaId]
        );
      }

      // 2) Enviar correo de confirmación al cliente
      if (email) {
        await sendEmail({
          to: email,
          subject: "✅ Tu reserva Bonanza ha sido confirmada",
          html: `
            <h1>Reserva confirmada</h1>
            <p>Gracias por tu pago. Tu viaje ha sido confirmado exitosamente.</p>
            <p>Número de reserva: <b>${reservaId || "N/A"}</b></p>
          `,
        });
      }

      console.log("✔ Pago confirmado y correo enviado:", reservaId, email);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Error procesando webhook:", err);
    res.status(500).send("Webhook handler failed");
  }
}

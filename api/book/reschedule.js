// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";
import { DateTime } from "luxon";
import Stripe from "stripe";

const TZ = "America/Denver";
const CURRENCY = "usd";

// ===== Reglas de negocio (ajústalas a tu gusto) =====
// Ventana permitida para pickup (local time)
const OPEN_HHMM = "07:00";
const CLOSE_HHMM = "22:30";
// Fee por after-hours (si estuviera fuera de la ventana; hoy NO debería dispararse
// porque validamos la ventana. Lo dejamos para flexibilidad futura).
const AFTER_HOURS_FEE = 50; // USD

// ===== Utils =====
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s) { return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr) {
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
}
function localToUtcIso(dateStr, timeStr, zone = TZ) {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}
function withinWindow(hhmm, open = OPEN_HHMM, close = CLOSE_HHMM) {
  // Compara strings "HH:MM"
  return hhmm >= open && hhmm <= close;
}

/**
 * Calcula diferencia a cobrar (delta) entre horario anterior y nuevo.
 * Por ahora solo considera after-hours fee. Expandible.
 * Retorna número en USD (p.ej. 0, 20, 50). Puede ser negativo (no cobramos).
 */
function computeDelta(oldTimeHHMM, newTimeHHMM) {
  const oldFee = withinWindow(oldTimeHHMM) ? 0 : AFTER_HOURS_FEE;
  const newFee = withinWindow(newTimeHHMM) ? 0 : AFTER_HOURS_FEE;
  return newFee - oldFee; // si >0 se cobra diferencia
}

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { cn, newDate, newTime /*, email */ } = req.body || {};

  // Validación de campos
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok: false, error: "Missing or invalid fields (cn, newDate, newTime)" });
  }
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok: false, error: "New pickup must be at least 24h ahead" });
  }
  // Validación de ventana (07:00–22:30 local)
  if (!withinWindow(newTime)) {
    return res.status(400).json({ ok: false, error: `New time must be between 7:00 AM and 10:30 PM` });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1) Buscar booking por confirmation_number (case-insensitive sugerido)
    const bookings = await sql`
      select id, confirmation_number, status, full_name, email,
             date_iso, time_hhmm, quoted_total, vehicle_type
        from bookings
       where upper(confirmation_number) = ${String(cn).trim().toUpperCase()}
       limit 1
    `;
    if (!bookings.length) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }
    const bk = bookings[0];

    // Opcional: autorizar por email del cliente.
    // if (email) {
    //   const chk = await sql`
    //     select 1 from bookings
    //      where upper(confirmation_number)=${String(cn).trim().toUpperCase()}
    //        and lower(email)=lower(${email})
    //   `;
    //   if (!chk.length) return res.status(401).json({ ok:false, error:"Unauthorized" });
    // }

    // 2) Reglas de ventana de 24h desde el pickup ACTUAL
    const currentDt = new Date(`${bk.date_iso}T${bk.time_hhmm}:00`);
    if (currentDt.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      return res.status(409).json({ ok: false, error: "Cannot reschedule within 24h of current pickup" });
    }

    // 3) Evitar no-op
    if (bk.date_iso === newDate && bk.time_hhmm === newTime) {
      return res.status(409).json({ ok: false, error: "New date/time equals current booking" });
    }

    // 4) Calcular diferencia (delta) con reglas actuales
    const deltaUSD = computeDelta(bk.time_hhmm, newTime); // >0 se cobra; <=0 no cobramos
    const needsPayment = deltaUSD > 0;

    // 5) Si NO necesita pago → actualizamos booking + appointment y listo
    if (!needsPayment) {
      const updRows = await sql`
        update bookings
           set date_iso   = ${newDate},
               time_hhmm  = ${newTime},
               updated_at = now()
         where id = ${bk.id}
         returning id, confirmation_number, status, date_iso, time_hhmm, quoted_total, updated_at
      `;
      const updatedBooking = updRows[0];

      // Actualizar appointment vinculado (si existe)
      const newPickupUtc = localToUtcIso(newDate, newTime, TZ);
      let appointmentUpdated = null;
      if (newPickupUtc) {
        const appts = await sql`
          select id, driver_id, status
            from appointments
           where (meta->>'booking_id')::int = ${bk.id}
           order by id desc
           limit 1
        `;
        if (appts.length) {
          const appt = appts[0];
          const updAppt = await sql`
            update appointments
               set pickup_time = ${newPickupUtc},
                   status = ${'pending'},
                   driver_id = null,
                   updated_at = now()
             where id = ${appt.id}
             returning id, pickup_time, status, driver_id
          `;
          appointmentUpdated = updAppt[0] || null;

          await sql`
            insert into assignment_logs (appointment_id, rule_trace)
                 values (${appt.id}, ${JSON.stringify({
                   action: "reschedule",
                   from: `${bk.date_iso} ${bk.time_hhmm}`,
                   to: `${newDate} ${newTime}`,
                   tz: TZ,
                   deltaUSD,
                 })}::jsonb)
          `;
        }
      }

      return res.status(200).json({
        ok: true,
        needsPayment: false,
        delta: deltaUSD,
        currency: CURRENCY,
        booking: updatedBooking,
        appointment: appointmentUpdated,
        message: deltaUSD < 0
          ? "Rescheduled. No charge (a lower fee applies; no automatic refunds)."
          : "Rescheduled with no extra charge.",
      });
    }

    // 6) Sí necesita pago → crear Stripe Checkout solo por la diferencia
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "Missing STRIPE_SECRET_KEY env var" });
    }
    const stripe = new Stripe(secret);

    const amountCents = Math.round(deltaUSD * 100);

    // Puedes personalizar estas URLs
    const baseUrl = process.env.PUBLIC_BASE_URL || "https://bonanza-gps-1dr1.vercel.app";
    const successUrl = `${baseUrl}/app/reschedule.html?cn=${encodeURIComponent(bk.confirmation_number)}&status=paid`;
    const cancelUrl = `${baseUrl}/app/reschedule.html?cn=${encodeURIComponent(bk.confirmation_number)}&status=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: CURRENCY,
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: `Reschedule difference — ${bk.confirmation_number}`,
              description: `Change to ${newDate} ${newTime} (local)`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        cn: bk.confirmation_number,
        new_date: newDate,
        new_time: newTime,
        delta_usd: String(deltaUSD),
        type: "reschedule-difference",
      },
    });

    // Marcamos en DB que hay un pago pendiente por delta
    await sql`
      update bookings
         set updated_at = now(),
             meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({
               pending_reschedule: {
                 newDate,
                 newTime,
                 deltaUSD,
                 stripeSessionId: session.id,
               },
             })}::jsonb
       where id = ${bk.id}
    `;

    return res.status(200).json({
      ok: true,
      needsPayment: true,
      delta: deltaUSD,
      currency: CURRENCY,
      stripeSessionId: session.id,
      stripeUrl: session.url,
      message: "Extra amount required. Complete payment to finish reschedule.",
    });

  } catch (err) {
    console.error("book/reschedule error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

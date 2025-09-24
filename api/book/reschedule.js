// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";
import { DateTime } from "luxon";

const TZ = "America/Denver";

// ===== Helpers =====
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s)    { return /^\d{2}:\d{2}$/.test(s || ""); }

function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: TZ });
  if (!d.isValid) return false;
  return d.diffNow("hours").hours >= 24;
}

function localToUtcIso(dateStr, timeStr, zone = TZ){
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  const { cn, newDate, newTime } = req.body || {};

  // 1) Validación de payload
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"Missing or invalid fields (cn, newDate, newTime)" });
  }
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok:false, error:"New pickup must be at least 24h ahead" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 2) Buscar booking (case-insensitive por si acaso)
    const rows = await sql`
      SELECT id, confirmation_number, status, date_iso, time_hhmm, quoted_total,
             reschedule_count, created_at, updated_at
        FROM bookings
       WHERE UPPER(confirmation_number) = ${String(cn).trim().toUpperCase()}
       LIMIT 1
    `;
    if (!rows.length) {
      return res.status(404).json({ ok:false, error:"Booking not found" });
    }
    const bk = rows[0];

    // 3) Ventana de 24h para el pickup ACTUAL (no se permite si faltan < 24h)
    const currentLocal = DateTime.fromISO(`${bk.date_iso}T${bk.time_hhmm}`, { zone: TZ });
    if (!currentLocal.isValid) {
      return res.status(500).json({ ok:false, error:"Stored booking date/time invalid" });
    }
    if (currentLocal.diffNow("hours").hours < 24) {
      return res.status(409).json({ ok:false, error:"Cannot reschedule within 24h of current pickup" });
    }

    // 4) No-op
    if (bk.date_iso === newDate && bk.time_hhmm === newTime) {
      return res.status(409).json({ ok:false, error:"New date/time equals current booking" });
    }

    // 5) Límite de reprogramaciones (máx 2)
    const count = Number(bk.reschedule_count || 0);
    if (count >= 2) {
      return res.status(409).json({ ok:false, error:"Maximum number of reschedules reached" });
    }

    // 6) Actualizar booking (fecha/hora y contador)
    const upd = await sql`
      UPDATE bookings
         SET date_iso = ${newDate},
             time_hhmm = ${newTime},
             reschedule_count = ${count + 1},
             updated_at = NOW()
       WHERE id = ${bk.id}
       RETURNING id, confirmation_number, status, date_iso, time_hhmm, quoted_total, reschedule_count, updated_at
    `;
    const updatedBooking = upd[0];

    // 7) Actualizar appointment enlazado (si existe)
    const newPickupUtc = localToUtcIso(newDate, newTime, TZ);
    let appointmentUpdated = null;

    if (newPickupUtc) {
      const appts = await sql`
        SELECT id, driver_id, status
          FROM appointments
         WHERE (meta->>'booking_id')::int = ${bk.id}
         ORDER BY id DESC
         LIMIT 1
      `;
      if (appts.length) {
        const appt = appts[0];
        const newStatus = "pending"; // volvemos a pool y liberamos driver si lo tenía
        const updAppt = await sql`
          UPDATE appointments
             SET pickup_time = ${newPickupUtc},
                 status = ${newStatus},
                 driver_id = NULL,
                 updated_at = NOW()
           WHERE id = ${appt.id}
           RETURNING id, pickup_time, status, driver_id
        `;
        appointmentUpdated = updAppt[0] || null;

        await sql`
          INSERT INTO assignment_logs (appointment_id, rule_trace)
          VALUES (${appt.id}, ${JSON.stringify({
            action: "reschedule",
            from: `${bk.date_iso} ${bk.time_hhmm}`,
            to: `${newDate} ${newTime}`,
            tz: TZ
          })}::jsonb)
        `;
      }
    }

    // 8) Facturación por diferencia (placeholder: hoy siempre 0)
    //    Aquí luego podremos calcular diff real (recotizar ruta, after-hours, etc.)
    const billing = {
      extra_due: 0,      // en USD
      currency: "usd",
      reason: "reschedule_no_price_change",
      can_pay_diff: false // cuando implementemos, esto se pondrá en true si extra_due > 0
    };

    return res.status(200).json({
      ok: true,
      booking: updatedBooking,
      appointment: appointmentUpdated,
      billing
    });

  } catch (err) {
    console.error("book/reschedule error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

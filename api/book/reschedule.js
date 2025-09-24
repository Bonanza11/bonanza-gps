// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";
import { DateTime } from "luxon";

const TZ = "America/Denver";

// ===== Helpers =====
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s){ return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}
function localToUtcIso(dateStr, timeStr, zone = TZ){
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone });
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

  // Validación de campos
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"Missing or invalid fields (cn, newDate, newTime)" });
  }
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok:false, error:"New pickup must be at least 24h ahead" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1) Buscar booking
    const rows = await sql`
      select id, confirmation_number, status,
             date_iso, time_hhmm, reschedule_count,
             quoted_total, vehicle_type, mg_choice, pickup, dropoff,
             updated_at
        from bookings
       where upper(confirmation_number) = ${String(cn).toUpperCase()}
       limit 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"Booking not found" });

    const bk = rows[0];

    // 2) Regla de máximo 2 re-agendamientos
    const count = Number(bk.reschedule_count || 0);
    if (count >= 2) {
      return res.status(409).json({
        ok:false,
        error:"reschedule_limit_reached",
        message:"This reservation has already been rescheduled twice."
      });
    }

    // 3) Ventana de 24h del pickup actual
    const currentDt = new Date(`${bk.date_iso}T${bk.time_hhmm}:00`);
    if (currentDt.getTime() - Date.now() < 24*60*60*1000) {
      return res.status(409).json({ ok:false, error:"Cannot reschedule within 24h of current pickup" });
    }

    // 4) Evitar no-op
    if (bk.date_iso === newDate && bk.time_hhmm === newTime) {
      return res.status(409).json({ ok:false, error:"New date/time equals current booking" });
    }

    // 5) Actualizar booking + incrementar contador
    const updRows = await sql`
      update bookings
         set date_iso         = ${newDate},
             time_hhmm        = ${newTime},
             reschedule_count = ${count + 1},
             updated_at       = now()
       where id = ${bk.id}
       returning id, confirmation_number, status,
                 date_iso, time_hhmm, reschedule_count, updated_at
    `;
    const updatedBooking = updRows[0];

    // 6) Actualizar cita vinculada (si existe)
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
                 status      = 'pending',
                 driver_id   = null,
                 updated_at  = now()
           where id = ${appt.id}
           returning id, pickup_time, status, driver_id
        `;
        appointmentUpdated = updAppt[0] || null;

        await sql`
          insert into assignment_logs (appointment_id, rule_trace)
          values (${appt.id}, ${JSON.stringify({
            action:"reschedule",
            from:`${bk.date_iso} ${bk.time_hhmm}`,
            to:`${newDate} ${newTime}`,
            tz:TZ
          })}::jsonb)
        `;
      }
    }

    return res.status(200).json({
      ok:true,
      booking: updatedBooking,
      appointment: appointmentUpdated
    });

  } catch (err) {
    console.error("book/reschedule error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

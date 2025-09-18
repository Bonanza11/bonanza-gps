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
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
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

  const { cn, newDate, newTime/*, email*/ } = req.body || {};

  // Validación de campos
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"Missing or invalid fields (cn, newDate, newTime)" });
  }
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok:false, error:"New pickup must be at least 24h ahead" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1) Buscar booking por confirmation_number
    const bookings = await sql`
      select id, confirmation_number, status, date_iso, time_hhmm, updated_at
      from bookings
      where confirmation_number = ${cn}
      limit 1
    `;
    if (!bookings.length) {
      return res.status(404).json({ ok:false, error:"Booking not found" });
    }
    const bk = bookings[0];

    // (Opcional de seguridad adicional)
    // if (email) {
    //   const chk = await sql`select 1 from bookings where confirmation_number=${cn} and lower(email)=lower(${email})`;
    //   if (!chk.length) return res.status(401).json({ ok:false, error:"Unauthorized" });
    // }

    // 2) Reglas de ventana (24h desde el pickup actual)
    const currentDt = new Date(`${bk.date_iso}T${bk.time_hhmm}:00`);
    if (currentDt.getTime() - Date.now() < 24*60*60*1000) {
      return res.status(409).json({ ok:false, error:"Cannot reschedule within 24h of current pickup" });
    }

    // 3) Evitar no-op (misma fecha/hora)
    if (bk.date_iso === newDate && bk.time_hhmm === newTime) {
      return res.status(409).json({ ok:false, error:"New date/time equals current booking" });
    }

    // 4) Actualizar booking
    const updRows = await sql`
      update bookings
         set date_iso   = ${newDate},
             time_hhmm  = ${newTime},
             updated_at = now()
       where id = ${bk.id}
       returning id, confirmation_number, status, date_iso, time_hhmm, updated_at
    `;
    const updatedBooking = updRows[0];

    // 5) También actualizar el appointment vinculado (si existe)
    //    En create.js guardamos booking_id dentro de appointments.meta->'booking_id'
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
        // Si ya tenía driver asignado, lo devolvemos a 'pending' y liberamos driver
        const setStatus = 'pending';
        const updAppt = await sql`
          update appointments
             set pickup_time = ${newPickupUtc},
                 status = ${setStatus},
                 driver_id = null,
                 updated_at = now()
           where id = ${appt.id}
           returning id, pickup_time, status, driver_id
        `;
        appointmentUpdated = updAppt[0] || null;

        // Log opcional de reprogramación
        await sql`
          insert into assignment_logs (appointment_id, rule_trace)
          values (${appt.id}, ${JSON.stringify({action:"reschedule", from: `${bk.date_iso} ${bk.time_hhmm}`, to: `${newDate} ${newTime}`, tz: TZ})}::jsonb)
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

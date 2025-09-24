// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";
import { DateTime } from "luxon";

const TZ = "America/Denver";

// helpers
const isISODate = s => /^\d{4}-\d{2}-\d{2}$/.test(s||"");
const isTime    = s => /^\d{2}:\d{2}$/.test(s||"");
const plus24h   = (d) => (d.getTime() - Date.now()) >= 24*60*60*1000;
function localToUtcIso(dateStr, timeStr, zone = TZ){
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export default async function handler(req, res){
  // CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow","POST");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  const {
    cn,
    // nuevos campos editables
    pickup,
    dropoff,
    vehicleType,           // "suv" | "van"
    meetGreet = "none",    // "none" | "tsa_exit" | "baggage_claim"
    distance_miles,        // calculado en front con Google
    // fecha/hora
    newDate,
    newTime,
    // control de cobro
    diffCents = 0,
    stripePaymentIntentId  // si hubo diferencia > 0, viene validado por front
  } = req.body || {};

  // validación básica
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"Missing/invalid cn/newDate/newTime" });
  }
  const newDT = new Date(`${newDate}T${newTime}:00`);
  if (!plus24h(newDT)) return res.status(400).json({ ok:false, error:"New pickup must be ≥24h ahead" });

  try{
    const sql = neon(process.env.DATABASE_URL);

    // 1) carga booking
    const rows = await sql`
      select id, confirmation_number, status, full_name, email,
             pickup, dropoff, date_iso, time_hhmm, vehicle_type, mg_choice,
             quoted_total, reschedule_count, stripe_payment_intent
        from bookings
       where upper(confirmation_number) = ${String(cn).toUpperCase()}
       limit 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"Booking not found" });
    const bk = rows[0];

    // 2) reglas
    const currentDT = new Date(`${bk.date_iso}T${bk.time_hhmm}:00`);
    if (!plus24h(currentDT)) {
      return res.status(409).json({ ok:false, error:"Cannot reschedule within 24h of current pickup" });
    }
    if ((bk.reschedule_count || 0) >= 2) {
      return res.status(409).json({ ok:false, error:"Reached reschedule limit (2)" });
    }

    // 3) si hay diferencia a cobrar, debe venir comprobante (ya pagado)
    const needsDiff = Number(diffCents) > 0;
    if (needsDiff && !stripePaymentIntentId) {
      return res.status(402).json({ ok:false, error:"payment_required" });
    }

    // 4) actualizar booking (incluye campos editables)
    const upd = await sql`
      update bookings
         set pickup        = ${pickup || bk.pickup},
             dropoff       = ${dropoff || bk.dropoff},
             vehicle_type  = ${vehicleType || bk.vehicle_type},
             mg_choice     = ${meetGreet || bk.mg_choice},
             date_iso      = ${newDate},
             time_hhmm     = ${newTime},
             reschedule_count = coalesce(reschedule_count,0) + 1,
             quoted_total  = greatest(quoted_total, ${bk.quoted_total}), -- no bajar total aquí
             updated_at    = now()
       where id = ${bk.id}
       returning id, confirmation_number, pickup, dropoff, vehicle_type, mg_choice,
                 date_iso, time_hhmm, quoted_total, reschedule_count
    `;
    const updated = upd[0];

    // 5) appointment (si existe): set pending, liberar driver, actualizar hora
    const newPickupUtc = localToUtcIso(newDate, newTime, TZ);
    let appt = null;
    if (newPickupUtc) {
      const appts = await sql`
        select id, driver_id, status
          from appointments
         where (meta->>'booking_id')::int = ${bk.id}
         order by id desc
         limit 1
      `;
      if (appts.length) {
        const a = appts[0];
        const x = await sql`
          update appointments
             set pickup_time = ${newPickupUtc},
                 status = 'pending',
                 driver_id = null,
                 updated_at = now()
           where id = ${a.id}
        returning id, pickup_time, status, driver_id
        `;
        appt = x[0];

        await sql`
          insert into assignment_logs (appointment_id, rule_trace)
               values (${a.id}, ${JSON.stringify({
                 action:"reschedule",
                 from:`${bk.date_iso} ${bk.time_hhmm}`,
                 to:`${newDate} ${newTime}`,
                 pickup: pickup || bk.pickup,
                 dropoff: dropoff || bk.dropoff,
                 vehicle: vehicleType || bk.vehicle_type,
                 mg: meetGreet || bk.mg_choice
               })}::jsonb)
        `;
      }
    }

    return res.status(200).json({ ok:true, booking: updated, appointment: appt });
  } catch (e) {
    console.error("book/reschedule error:", e);
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
}

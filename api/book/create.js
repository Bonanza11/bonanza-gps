// /api/book/create.js
import { neon } from "@neondatabase/serverless";
import { DateTime } from "luxon";

/* ===== Config ===== */
const TZ = "America/Denver";

/* ===== Validaciones mínimas ===== */
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s){ return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}

/* ===== Util ===== */
function localDateTimeToUtcIso(dateStr, timeStr, zone = TZ){
  // dateStr = 'YYYY-MM-DD', timeStr = 'HH:mm' en hora local (Denver)
  const dtLocal = DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone });
  if (!dtLocal.isValid) return null;
  return dtLocal.toUTC().toISO();
}

export default async function handler(req, res){
  /* ===== CORS ===== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  /* ===== Solo POST ===== */
  if (req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  try{
    const {
      confirmationNumber,
      fullname, phone, email,
      pickup, dropoff,
      date, time,
      vehicleType = "suv",
      distanceMiles = null,
      quotedTotal,
      flightNumber = null,
      flightOriginCity = null,
      tailNumber = null,
      privateFlightOriginCity = null,
      specialInstructions = null,
      mgChoice = null,
      stripeSessionId = null,
      stripePaymentIntent = null
    } = req.body || {};

    // ===== Validaciones actuales (las mantenemos) =====
    if (!confirmationNumber || !fullname || !email || !pickup || !dropoff || !date || !time || quotedTotal == null){
      return res.status(400).json({ ok:false, error:"Missing required fields" });
    }
    if (!atLeast24hAhead(date, time)){
      return res.status(400).json({ ok:false, error:"Pickup must be at least 24h ahead" });
    }

    const sql = neon(process.env.DATABASE_URL);

    // =========================
    // 1) Insert en bookings (lo tuyo, intacto)
    // =========================
    const bookingRows = await sql`
      insert into bookings (
        confirmation_number,
        full_name, phone, email,
        pickup, dropoff,
        date_iso, time_hhmm,
        vehicle_type, distance_miles, quoted_total,
        flight_number, flight_origin_city,
        tail_number, private_origin_city,
        special_instructions,
        mg_choice,
        stripe_session_id, stripe_payment_intent
      ) values (
        ${confirmationNumber},
        ${fullname}, ${phone}, ${email},
        ${pickup}, ${dropoff},
        ${date}, ${time},
        ${vehicleType}, ${distanceMiles}, ${quotedTotal},
        ${flightNumber}, ${flightOriginCity},
        ${tailNumber}, ${privateFlightOriginCity},
        ${specialInstructions},
        ${mgChoice},
        ${stripeSessionId}, ${stripePaymentIntent}
      )
      returning id, confirmation_number, status, created_at, updated_at
    `;
    const booking = bookingRows[0];

    // =========================
    // 2) Upsert cliente en clients
    // =========================
    let clientRow = (await sql`
      select * from clients where email = ${email} limit 1;
    `)[0];

    if (!clientRow && phone){
      clientRow = (await sql`select * from clients where phone = ${phone} limit 1;`)[0];
    }
    if (!clientRow){
    // después
clientRow = (await sql`
  insert into clients (name, phone, email, rating)
  values (${name}, ${phone || null}, ${email || null}, 'good')
  returning *;
`)[0];
    }

    // =========================
    // 3) Crear appointment enlazado
    // =========================
    const pickupUtcIso = localDateTimeToUtcIso(date, time, TZ);
    if (!pickupUtcIso){
      return res.status(400).json({ ok:false, error:"Invalid pickup date/time" });
    }

    // Mapear vehicleType => Vehicle preference
    const vehiclePref = (vehicleType || "suv").toUpperCase() === "VAN" ? "Van" : "SUV";

    const appt = (await sql`
      insert into appointments (
        client_id,
        pickup_address, dropoff_address,
        pickup_time,
        flight_number, distance_miles, price_usd, vehicle_pref,
        status, source, meta, created_at
      ) values (
        ${clientRow.id},
        ${pickup}, ${dropoff},
        ${pickupUtcIso},
        ${flightNumber || null}, ${distanceMiles || null}, ${quotedTotal || null}, ${vehiclePref},
        'pending', 'website',
        ${JSON.stringify({
          booking_id: booking.id,
          confirmationNumber,
          mgChoice, tailNumber, privateFlightOriginCity, flightOriginCity,
          stripeSessionId, stripePaymentIntent
        })}::jsonb,
        now()
      )
      returning *;
    `)[0];

    // =========================
    // 4) Auto-asignación básica
    // =========================
    const assigned = await autoAssign(sql, appt);

    if (assigned?.driver_id){
      await sql`
        update appointments
        set driver_id = ${assigned.driver_id}, status = 'assigned'
        where id = ${appt.id};
      `;
      await sql`
        insert into assignment_logs (appointment_id, assigned_driver_id, rule_trace)
        values (${appt.id}, ${assigned.driver_id}, ${JSON.stringify(assigned.rule_trace)}::jsonb);
      `;
    } else {
      await sql`
        insert into assignment_logs (appointment_id, rule_trace)
        values (${appt.id}, ${JSON.stringify(assigned.rule_trace)}::jsonb);
      `;
    }

    // =========================
    // 5) Respuesta unificada
    // =========================
    return res.status(200).json({
      ok: true,
      booking,
      appointment: {
        id: appt.id,
        status: assigned?.driver_id ? "assigned" : "pending",
        pickup_time: pickupUtcIso,
        driver_id: assigned?.driver_id || null
      },
      assigned_driver: assigned?.driver || null,
      notes: assigned?.notes || null
    });

  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}

/* ====== Motor de asignación mínima ====== */
async function autoAssign(sql, appt){
  // 1) Candidatos activos
  const drivers = await sql`select * from drivers where status = 'active';`;

  // 2) Hora local a partir de pickup_time (que viene en UTC)
  const pickupLocal = DateTime.fromISO(appt.pickup_time, { zone: "utc" }).setZone(TZ);
  const weekdayLuxon = pickupLocal.weekday % 7; // Luxon: 1..7 → 0..6

  // 3) Filtrar por 24h o por turno
  const candidates = [];
  for (const d of drivers){
    if (d.work_mode === '24h'){
      candidates.push(d);
      continue;
    }
    const shifts = await sql`
      select * from driver_shifts
      where driver_id = ${d.id}
        and (weekday = ${weekdayLuxon} or date_on = ${pickupLocal.toISODate()});
    `;
    const within = shifts.some(s => {
      const start = DateTime.fromISO(`${pickupLocal.toISODate()}T${s.start_time}`, { zone: s.timezone || TZ });
      const end   = DateTime.fromISO(`${pickupLocal.toISODate()}T${s.end_time}`,   { zone: s.timezone || TZ });
      return pickupLocal >= start && pickupLocal <= end;
    });
    if (within) candidates.push(d);
  }

  if (!candidates.length){
    return { rule_trace:{reason:'no-available-driver'}, notes:'Sin conductor disponible por turnos' };
  }

  // 4) Escoger el que menos carga tiene hoy
  const day = pickupLocal.toISODate();
  const loads = [];
  for (const d of candidates){
    const row = (await sql`
      select count(*)::int as c
      from appointments
      where driver_id = ${d.id}
        and status in ('pending','assigned','in_progress')
        and date(pickup_time at time zone 'utc' at time zone ${TZ}) = ${day};
    `)[0];
    loads.push({ d, c: row?.c || 0 });
  }
  loads.sort((a,b)=> a.c - b.c);
  const winner = loads[0].d;

  return {
    driver_id: winner.id,
    driver: { id: winner.id, name: winner.name },
    rule_trace: { reason:'auto-assigned', winner: winner.id, loads },
    notes: `Asignado automáticamente a ${winner.name}`
  };
}

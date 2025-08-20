// /api/book/create.js
import { neon } from "@neondatabase/serverless";

/* ===== Validaciones mínimas ===== */
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s){ return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
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

    if (!confirmationNumber || !fullname || !email || !pickup || !dropoff || !date || !time || quotedTotal == null){
      return res.status(400).json({ ok:false, error:"Missing required fields" });
    }
    if (!atLeast24hAhead(date, time)){
      return res.status(400).json({ ok:false, error:"Pickup must be at least 24h ahead" });
    }

    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
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

    return res.status(200).json({ ok:true, booking: rows[0] });
  }catch(err){
    console.error(err);
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}

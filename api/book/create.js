// /api/book/create.js
import { neon } from "@neondatabase/serverless";

function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s)    { return /^\d{2}:\d{2}$/.test(s || ""); }

function atLeast24hAhead(dateStr, timeStr) {
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const {
      confirmationNumber, // ya lo generas en el front
      fullname, phone, email,
      pickup, dropoff,
      date, time,
      specialInstructions = null,
      flightNumber = null, flightOriginCity = null,
      tailNumber = null, privateFlightOriginCity = null,
      vehicleType = "suv",
      distanceMiles = null,
      quotedTotal
    } = req.body || {};

    // Validaciones mínimas
    if (!fullname || !phone || !email || !pickup || !dropoff || !date || !time || !quotedTotal) {
      return res.status(400).json({ ok:false, error:"Missing required fields" });
    }
    if (!atLeast24hAhead(date, time)) {
      return res.status(400).json({ ok:false, error:"Pickup must be at least 24h ahead" });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Inserta en la tabla "bookings" (según el esquema que creamos)
    const rows = await sql`
      insert into bookings (
        confirmation_number,
        full_name, phone, email,
        pickup_address, dropoff_address,
        pickup_date, pickup_time,
        vehicle_type, distance_miles, quoted_total,
        special_instructions,
        flight_number, flight_origin_city,
        tail_number, private_flight_origin_city
      ) values (
        ${confirmationNumber},
        ${fullname}, ${phone}, ${email},
        ${pickup}, ${dropoff},
        ${date}, ${time},
        ${vehicleType}, ${distanceMiles}, ${quotedTotal},
        ${specialInstructions},
        ${flightNumber}, ${flightOriginCity},
        ${tailNumber}, ${privateFlightOriginCity}
      )
      returning id, confirmation_number, created_at
    `;

    const booking = rows[0];
    return res.status(200).json({ ok:true, booking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:String(err) });
  }
}

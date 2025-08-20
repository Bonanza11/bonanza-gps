// /api/book/get.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  const cn = (req.query.cn || "").trim();
  if (!cn) {
    return res.status(400).json({ ok:false, error:"Missing 'cn' (confirmation number)" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      select id, confirmation_number, status, full_name, phone, email,
             pickup, dropoff, date_iso, time_hhmm, vehicle_type,
             distance_miles, quoted_total,
             flight_number, flight_origin_city,
             tail_number, private_origin_city,
             special_instructions, mg_choice,
             stripe_session_id, stripe_payment_intent,
             created_at, updated_at
      from bookings
      where confirmation_number = ${cn}
      limit 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"Not found" });
    return res.status(200).json({ ok:true, booking: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

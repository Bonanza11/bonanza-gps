// /api/book/get.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  /* ===== CORS ===== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  /* ===== Solo GET ===== */
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  const cn = (req.query.cn || "").trim();
  if (!cn) return res.status(400).json({ ok:false, error:"missing_cn" });

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
      SELECT
        id,
        confirmation_number,
        status,
        full_name,
        phone,
        email,
        pickup,
        dropoff,
        date_iso,
        time_hhmm,
        vehicle_type,
        distance_miles,
        quoted_total,
        flight_number,
        flight_origin_city,
        tail_number,
        private_origin_city,
        special_instructions,
        mg_choice,
        stripe_session_id,
        stripe_payment_intent,
        created_at,
        updated_at,
        COALESCE(reschedules_count, 0) AS reschedules_count,
        COALESCE(reschedules, '[]'::jsonb) AS reschedules
      FROM bookings
      WHERE confirmation_number = ${cn}
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ ok:false, error:"not_found" });
    }

    const b = rows[0];

    // Normalizamos nombres (camelCase) para que calcen con tu front
    const booking = {
      id: b.id,
      cn: b.confirmation_number,
      status: b.status,
      fullname: b.full_name,
      phone: b.phone,
      email: b.email,
      pickup: b.pickup,
      dropoff: b.dropoff,
      date_iso: b.date_iso,
      time_hhmm: b.time_hhmm,
      vehicleType: b.vehicle_type,
      distanceMiles: b.distance_miles,
      quotedTotal: b.quoted_total,
      flight_number: b.flight_number,
      flight_origin_city: b.flight_origin_city,
      tail_number: b.tail_number,
      private_origin_city: b.private_origin_city,
      special_instructions: b.special_instructions,
      mg_choice: b.mg_choice,
      stripe_session_id: b.stripe_session_id,
      stripe_payment_intent: b.stripe_payment_intent,
      created_at: b.created_at,
      updated_at: b.updated_at,
      // 👇 nuevos
      reschedulesCount: Number(b.reschedules_count || 0),
      reschedules: b.reschedules
    };

    return res.status(200).json({ ok:true, booking });
  } catch (err) {
    console.error("[/api/book/get] error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

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
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const cn = String(req.query.cn || "").trim();
  if (!cn) return res.status(400).json({ ok: false, error: "Missing 'cn' (confirmation number)" });

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ ok:false, error:"Missing DATABASE_URL" });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Índice recomendado en DB:
    // CREATE INDEX IF NOT EXISTS idx_bookings_cn ON bookings(confirmation_number);
    const rows = await sql`
      select
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
        updated_at
      from bookings
      where confirmation_number = ${cn}
      limit 1
    `;

    if (!rows.length) {
      return res.status(404).json({ ok:false, error:"Not found" });
    }

    const r = rows[0];

    // —— Mapeo snake_case -> camelCase (lo que espera el front-end) ——
    const booking = {
      // claves “originales” por si las necesitas en HQ
      id: r.id,
      confirmation_number: r.confirmation_number,
      status: r.status,

      // camelCase usadas por reschedule.html
      cn: r.confirmation_number,
      fullname: r.full_name || "",
      phone: r.phone || "",
      email: r.email || "",
      pickup: r.pickup || "",
      dropoff: r.dropoff || "",

      date_iso: r.date_iso || null,
      date: r.date_iso || null,         // alias para front-end
      time_hhmm: r.time_hhmm || null,
      time: r.time_hhmm || null,        // alias para front-end

      vehicleType: String(r.vehicle_type || "suv").toLowerCase(),
      distanceMiles: (r.distance_miles != null) ? Number(r.distance_miles) : null,
      quotedTotal: (r.quoted_total != null) ? Number(r.quoted_total) : null,

      flightNumber: r.flight_number || "",
      flightOriginCity: r.flight_origin_city || "",
      tailNumber: r.tail_number || "",
      privateOriginCity: r.private_origin_city || "",
      specialInstructions: r.special_instructions || "",
      mg_choice: r.mg_choice || "none",

      stripeSessionId: r.stripe_session_id || "",
      stripePaymentIntent: r.stripe_payment_intent || "",

      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };

    return res.status(200).json({ ok:true, booking });
  } catch (err) {
    console.error("[/api/book/get] error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

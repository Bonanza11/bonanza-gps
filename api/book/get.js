// /api/book/get.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ===== Solo GET =====
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Normaliza y valida el confirmation number (alfa-num y guiones)
  const raw = String(req.query.cn || "").trim();
  const cn = raw.toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(cn)) {
    return res.status(400).json({ ok: false, error: "Invalid 'cn' format" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Case-insensitive (compara upper(col) con CN normalizado)
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
       where upper(confirmation_number) = ${cn}
       limit 1
    `;

    if (!rows.length) {
      // conserva semántica de 404
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    // cache ligera para lecturas (ajústalo si no te conviene)
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({ ok: true, booking: rows[0] });
  } catch (err) {
    console.error("book/get error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

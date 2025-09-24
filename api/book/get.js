// /api/book/get.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Solo JSON en las respuestas
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // ===== Solo GET =====
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  // ===== Validación de ENV =====
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) {
    res.status(500).json({ ok: false, error: "Missing DATABASE_URL env var" });
    return;
  }

  // ===== Validación de query =====
  const raw = String(req.query.cn || "").trim();
  const cn = raw.toUpperCase();

  // Permite formatos tipo BZ-20250908-ABCD o similares (alfa-num y guiones)
  if (!/^[A-Z0-9-]{4,40}$/.test(cn)) {
    res.status(400).json({ ok: false, error: "Invalid 'cn' format" });
    return;
  }

  try {
    const sql = neon(DB_URL);

    // Case-insensitive
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
        reschedule_count,                -- ← AÑADIDO
        stripe_session_id,
        stripe_payment_intent,
        created_at,
        updated_at
      from bookings
      where upper(confirmation_number) = ${cn}
      limit 1
    `;

    if (!rows.length) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }

    // Cache ligera
    res.setHeader("Cache-Control", "private, max-age=30");
    res.status(200).json({ ok: true, booking: rows[0] });
  } catch (err) {
    console.error("book/get error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message || err)
    });
  }
}

// /api/book/get.js
import { neon } from "@neondatabase/serverless";

// Fuerza runtime Node.js en Vercel (no Edge)
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
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

  // ===== ENV obligatoria =====
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) {
    res.status(500).json({ ok: false, error: "Missing DATABASE_URL env var" });
    return;
  }

  // ===== Validación de query =====
  // Normalizamos: quitamos espacios/guiones raros y ponemos mayúsculas
  const raw = String(req.query.cn || "")
    .replace(/\u2013|\u2014/g, "-")      // en-dash/em-dash → hyphen
    .trim();

  const cn = raw.toUpperCase();

  // Acepta alfa-num y guiones (p.ej. BZ-20250908-ABCD)
  if (!/^[A-Z0-9-]{4,40}$/.test(cn)) {
    res.status(400).json({ ok: false, error: "Invalid 'cn' format" });
    return;
  }

  try {
    const sql = neon(DB_URL);

    // Case-insensitive con UPPER en ambos lados (seguro y rápido con índice funcional si lo creas)
    const rows = await sql/*sql*/`
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
        reschedule_count,
        stripe_session_id,
        stripe_payment_intent,
        created_at,
        updated_at
      FROM bookings
      WHERE UPPER(confirmation_number) = UPPER(${cn})
      LIMIT 1
    `;

    if (!rows.length) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }

    // Cache ligera (puedes subir/bajar este valor)
    res.setHeader("Cache-Control", "private, max-age=30");
    res.status(200).json({ ok: true, booking: rows[0] });
  } catch (err) {
    console.error("book/get error:", err);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

// /api/reservations/index.js
// GET: lista | POST: crea
import { query } from "../_db.js";

const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // --- GET: incluir driver_name y notes ---
    if (req.method === "GET") {
      const rows = await query(
        `SELECT
           id,
           customer_name,
           email,
           phone,
           pickup_location,
           dropoff_location,
           pickup_time,
           vehicle_type,
           status,
           vehicle_id,
           driver_name,   -- incluido en respuesta
           notes          -- incluido en respuesta
         FROM reservations
         ORDER BY id DESC`
      );
      // El frontend espera un array JSON plano
      return res.json(Array.isArray(rows) ? rows : []);
    }

    // --- POST: crear reserva (driver_name / notes opcionales) ---
    if (req.method === "POST") {
      const {
        customer_name,
        email,
        phone,
        pickup_location,
        dropoff_location,
        pickup_time,
        vehicle_type = "SUV",
        driver_name = null, // opcional
        notes = null        // opcional
      } = req.body || {};

      // Campos mínimos
      if (!customer_name || !pickup_location || !dropoff_location || !pickup_time) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }

      const rows = await query(
        `INSERT INTO reservations
           (customer_name, email, phone,
            pickup_location, dropoff_location, pickup_time,
            vehicle_type, status, driver_name, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
         RETURNING *`,
        [
          customer_name,
          email || null,
          phone || null,
          pickup_location,
          dropoff_location,
          pickup_time,
          vehicle_type,
          driver_name,
          notes
        ]
      );

      return res.json(rows?.[0] ?? null);
    }

    // --- Método no permitido ---
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (err) {
    console.error("[/api/reservations] ", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(err?.message || err)
    });
  }
}

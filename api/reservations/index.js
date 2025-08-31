// /api/reservations/index.js
// GET: lista | POST: crea
import { query } from "../_db.js";

const ADMIN = "supersecreto123";

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // --- GET: devolver también driver_name y notes ---
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
           driver_name,   -- ⬅️ nuevo en la respuesta
           notes          -- ⬅️ nuevo en la respuesta
         FROM reservations
         ORDER BY id DESC`
      );
      return res.json(rows); // array JSON
    }

    // --- POST: crear reserva (driver_name/notes no son requeridos) ---
    if (req.method === "POST") {
      const {
        customer_name,
        email,
        phone,
        pickup_location,
        dropoff_location,
        pickup_time,
        vehicle_type = "SUV",
      } = req.body || {};

      const rows = await query(
        `INSERT INTO reservations
           (customer_name, email, phone,
            pickup_location, dropoff_location, pickup_time,
            vehicle_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
         RETURNING *`,
        [
          customer_name,
          email,
          phone,
          pickup_location,
          dropoff_location,
          pickup_time,
          vehicle_type,
        ]
      );
      return res.json(rows[0]);
    }

    // --- Método no permitido ---
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (err) {
    console.error("[/api/reservations] ", err);
    return res
      .status(500)
      .json({ ok: false, error: "server_error", detail: String(err.message || err) });
  }
}

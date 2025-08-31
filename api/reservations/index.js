// /api/reservations/index.js
// GET: lista | POST: crea | PATCH: asigna/desasigna driver
import { query } from "../_db.js";

const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // ---------- GET ----------
    // Devuelve también vehicle_label y vehicle_plate de la tabla vehicles
    if (req.method === "GET") {
      const rows = await query(
        `SELECT
           r.id,
           r.customer_name,
           r.email,
           r.phone,
           r.pickup_location,
           r.dropoff_location,
           r.pickup_time,
           r.vehicle_type,
           r.status,
           r.vehicle_id,
           r.driver_name,
           r.notes,
           v.plate AS vehicle_plate,   -- placa directamente
           CASE
             WHEN v.id IS NULL THEN NULL
             ELSE v.plate::text || ' — ' || v.kind::text || ' — ' || COALESCE(v.driver_name,'')::text
           END AS vehicle_label
         FROM reservations r
         LEFT JOIN vehicles v
           ON v.id::text = r.vehicle_id::text   -- evita error uuid vs integer
         ORDER BY r.id DESC`
      );
      return res.json(Array.isArray(rows) ? rows : []);
    }

    // ---------- POST ----------
    // Crea la reserva (driver_name / notes opcionales)
    if (req.method === "POST") {
      const {
        customer_name,
        email,
        phone,
        pickup_location,
        dropoff_location,
        pickup_time,
        vehicle_type = "SUV",
        driver_name = null,
        notes = null
      } = req.body || {};

      // Validación mínima
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

    // ---------- PATCH ----------
    // Asignar / desasignar driver a una reserva
    // Permite pasar solo driver_id (uuid) y opcionalmente driver_name para compatibilidad
    if (req.method === "PATCH") {
      const { id, driver_id = null, driver_name = undefined } = req.body || {};
      if (!id) {
        return res.status(400).json({ ok: false, error: "missing_id" });
      }

      // Si no envías driver_name, no lo toca (COALESCE con el valor actual)
      const rows = await query(
        `UPDATE reservations
           SET driver_id = $2,
               driver_name = COALESCE($3, driver_name)
         WHERE id = $1
         RETURNING *`,
        [id, driver_id, driver_name]
      );

      return res.json(rows?.[0] ?? null);
    }

    // ---------- Método no permitido ----------
    res.setHeader("Allow", "GET, POST, PATCH");
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

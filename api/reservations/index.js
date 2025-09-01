// /api/reservations/index.js
// GET: lista | POST: crea | PATCH: asigna/desasigna driver
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

// 👇 Opcional si usas pg nativo (evita que Vercel intente correr en Edge)
export const config = { runtime: "nodejs" };

async function handler(req, res) {
  try {
    // ---------- GET ----------
    if (req.method === "GET") {
      const { rows } = await query(
        `SELECT
           r.id,
           r.customer_name,
           r.email,
           r.phone,
           r.pickup_location,
           r.dropoff_location,
           r.pickup_time,
           r.vehicle_type,
           lower(r.status) AS status,                 -- 👈 normaliza a minúsculas
           r.vehicle_id,
           r.driver_name,
           r.notes,
           r.assigned_at, r.started_at, r.arrived_at, r.done_at, r.updated_at,
           d.name  AS driver,
           v.plate AS vehicle_plate,
           CASE
             WHEN v.id IS NULL THEN NULL
             ELSE v.plate::text || ' — ' || v.kind::text || ' — ' || COALESCE(v.driver_name,'')::text
           END AS vehicle_label
         FROM reservations r
         LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
         LEFT JOIN drivers  d ON d.id = r.driver_id
         ORDER BY r.pickup_time DESC`
      );
      // 👇 devuelve array directo (lo que espera admin.html)
      return res.json(rows || []);
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

      if (!customer_name || !pickup_location || !dropoff_location || !pickup_time) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }

      const { rows } = await query(
        `INSERT INTO reservations
           (customer_name, email, phone,
            pickup_location, dropoff_location, pickup_time,
            vehicle_type, status, driver_name, notes, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9, now())
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
    // Asigna / desasigna driver
    // Si viene driver_id NULL -> desasigna -> PENDING
    // Si viene driver_id NO NULL -> asigna -> ASSIGNED + assigned_at=now()
    if (req.method === "PATCH") {
      const { id, driver_id = null, driver_name = undefined } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

      const { rows } = await query(
        `UPDATE reservations
           SET driver_id   = $2,
               driver_name = COALESCE($3, driver_name),
               status      = CASE WHEN $2 IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END,
               assigned_at = CASE WHEN $2 IS NULL THEN NULL       ELSE now()    END,
               updated_at  = now()
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

// 👇 Protegemos con requireAuth
export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

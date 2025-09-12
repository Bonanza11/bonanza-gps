// /api/drivers/assignments.js
import { requireAuth } from "../_lib/guard.js";
import { query } from "../_db.js";

const ALLOWED = ["DRIVER", "ADMIN", "DISPATCHER", "OWNER"];

/* Util: crea Date ISO a partir de date_iso + time_hhmm */
function combineDateTime(dateIso, hhmm) {
  try {
    if (!dateIso) return null;
    const t = (hhmm || "00:00").padStart(5, "0");
    const d = new Date(`${dateIso}T${t}:00`);
    return d.toISOString();
  } catch {
    return null;
  }
}

/* Lee asignaciones para un driver probando distintos esquemas */
async function fetchAssignmentsForDriver(driverId) {
  // 1) Tabla assignments (preferida)
  try {
    const r = await query(
      `SELECT
         id,
         driver_id,
         status,
         customer_name,
         pickup_location,
         dropoff_location,
         pickup_time
       FROM assignments
       WHERE driver_id = $1
       ORDER BY pickup_time ASC NULLS LAST, id DESC`,
      [driverId]
    );
    return r.rows || [];
  } catch (_) { /* relation "assignments" may not exist */ }

  // 2) Fallback: reservations
  try {
    const r = await query(
      `SELECT
         id,
         driver_id,
         COALESCE(status, 'PENDING') AS status,
         COALESCE(fullname, customer_name) AS customer_name,
         pickup AS pickup_location,
         dropoff AS dropoff_location,
         COALESCE(
           pickup_time,
           appointment_time,
           (CASE
              WHEN date_iso IS NOT NULL THEN (date_iso || 'T' || COALESCE(time_hhmm, '00:00') || ':00')
              ELSE NULL
            END)
         ) AS pickup_time_raw,
         date_iso, time_hhmm
       FROM reservations
       WHERE driver_id = $1
       ORDER BY
         COALESCE(
           pickup_time,
           appointment_time,
           (CASE
              WHEN date_iso IS NOT NULL THEN (date_iso || 'T' || COALESCE(time_hhmm, '00:00') || ':00')
              ELSE NULL
            END)
         ) ASC NULLS LAST,
         id DESC`,
      [driverId]
    );

    const rows = (r.rows || []).map(x => ({
      id: x.id,
      status: x.status || "PENDING",
      customer_name: x.customer_name || "",
      pickup_location: x.pickup_location || "",
      dropoff_location: x.dropoff_location || "",
      pickup_time:
        x.pickup_time_raw ||
        combineDateTime(x.date_iso, x.time_hhmm) ||
        null,
    }));
    return rows;
  } catch (_) {}

  // 3) Fallback: bookings
  try {
    const r = await query(
      `SELECT
         id,
         driver_id,
         COALESCE(status, 'PENDING') AS status,
         fullname AS customer_name,
         pickup AS pickup_location,
         dropoff AS dropoff_location,
         date_iso,
         time_hhmm
       FROM bookings
       WHERE driver_id = $1
       ORDER BY date_iso ASC NULLS LAST, time_hhmm ASC NULLS LAST, id DESC`,
      [driverId]
    );
    const rows = (r.rows || []).map(x => ({
      id: x.id,
      status: x.status || "PENDING",
      customer_name: x.customer_name || "",
      pickup_location: x.pickup_location || "",
      dropoff_location: x.dropoff_location || "",
      pickup_time: combineDateTime(x.date_iso, x.time_hhmm),
    }));
    return rows;
  } catch (_) {}

  // Nada disponible
  return [];
}

/* Actualiza status en la primera tabla que exista y contenga ese registro */
async function updateStatus({ id, driverId, status }) {
  const ALLOWED_STATUS = new Set([
    "PENDING", "ASSIGNED", "STARTED", "ARRIVED", "DONE", "CANCELLED"
  ]);
  const next = String(status || "").toUpperCase();
  if (!ALLOWED_STATUS.has(next)) {
    const err = new Error("invalid_status");
    err.code = 400;
    throw err;
  }

  // 1) assignments
  try {
    const r = await query(
      `UPDATE assignments
          SET status = $2, updated_at = NOW()
        WHERE id = $1 AND driver_id = $3
        RETURNING id, driver_id, status`,
      [id, next, driverId]
    );
    if (r.rows?.length) return r.rows[0];
  } catch (_) {}

  // 2) reservations
  try {
    const r = await query(
      `UPDATE reservations
          SET status = $2, updated_at = NOW()
        WHERE id = $1 AND driver_id = $3
        RETURNING id, driver_id, status`,
      [id, next, driverId]
    );
    if (r.rows?.length) return r.rows[0];
  } catch (_) {}

  // 3) bookings
  try {
    const r = await query(
      `UPDATE bookings
          SET status = $2, updated_at = NOW()
        WHERE id = $1 AND driver_id = $3
        RETURNING id, driver_id, status`,
      [id, next, driverId]
    );
    if (r.rows?.length) return r.rows[0];
  } catch (_) {}

  const e = new Error("not_found");
  e.code = 404;
  throw e;
}

async function handler(req, res) {
  try {
    const roles = req.user?.roles || [];
    const isHQ  = roles.some(r => ["ADMIN","DISPATCHER","OWNER"].includes(r));

    // Driver dueño de la sesión, salvo HQ con ?driver_id=
    const driverId =
      (isHQ && req.method === "GET" && req.query?.driver_id)
        ? String(req.query.driver_id)
        : String(req.user.id);

    if (req.method === "GET") {
      const rows = await fetchAssignmentsForDriver(driverId);
      return res.json({ ok:true, rows });
    }

    if (req.method === "PATCH") {
      // Body robusto
      let body = req.body;
      if (!body || typeof body !== "object") {
        const raw = await new Promise((resolve) => {
          let data = ""; req.on("data", c => data += c); req.on("end", () => resolve(data));
        });
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      }

      const id = body.id ?? body.assignment_id ?? body.appointment_id;
      const status = body.status;
      if (!id) return res.status(400).json({ ok:false, error:"missing_id" });
      if (!status) return res.status(400).json({ ok:false, error:"missing_status" });

      // Si HQ manda driver_id en query o body, úsalo; si no, es el propio driver
      const ownerId = (isHQ && (req.query?.driver_id || body.driver_id))
        ? String(req.query?.driver_id || body.driver_id)
        : driverId;

      try {
        const updated = await updateStatus({ id, driverId: ownerId, status });
        return res.json({ ok:true, updated });
      } catch (err) {
        const code = err.code || 500;
        return res.status(code).json({ ok:false, error: err.message || "update_failed" });
      }
    }

    res.setHeader("Allow", "GET, PATCH, OPTIONS");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  } catch (e) {
    console.error("[drivers/assignments] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

export default requireAuth(ALLOWED)(handler);

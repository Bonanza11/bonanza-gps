// /api/drivers/assignments.js
import { query } from "../_lib/db.js";
import { requireAuth } from "../_lib/guard.js";

/**
 * Requiere rol DRIVER (o acceso HQ vía x-admin-key que ya maneja guard.js).
 * - GET   /api/drivers/assignments
 *    -> { ok:true, rows:[{ id, status, customer_name, pickup_location, dropoff_location, pickup_time }] }
 *
 * - PATCH /api/drivers/assignments
 *    body: { id, status }
 *    -> { ok:true, assignment:{...} }
 */
export default requireAuth(["DRIVER"])(async (req, res) => {
  try {
    const driverId = req.user.id; // en el token: sub = drivers.id

    if (req.method === "GET") {
      const rows = await query(
        `select id, status, customer_name, pickup_location, dropoff_location, pickup_time
           from assignments
          where driver_id = $1
          order by pickup_time asc`,
        [driverId]
      );
      return res.json({ ok: true, rows });
    }

    if (req.method === "PATCH") {
      const { id, status } = req.body || {};
      if (!id || !status) {
        return res.status(400).json({ ok:false, error:"missing_fields" });
      }

      const rows = await query(
        `update assignments
            set status = $2
          where id = $1
            and driver_id = $3
          returning id, status, customer_name, pickup_location, dropoff_location, pickup_time`,
        [id, status, driverId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok:false, error:"not_found_or_not_owner" });
      }

      return res.json({ ok:true, assignment: rows[0] });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });

  } catch (e) {
    console.error("[drivers/assignments]", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

// /api/drivers/assignments.js
import { query } from "../_db.js";
const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

export default async function handler(req, res) {
  try {
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let { driver_id, from, to } = req.query || {};
    if (!driver_id) return res.status(400).json({ ok: false, error: "missing_driver_id" });

    // Normaliza strings vacíos a null
    from = from && String(from).trim() !== "" ? from : null;
    to   = to   && String(to).trim()   !== "" ? to   : null;

    const rows = await query(
      `SELECT
         r.id, r.customer_name, r.email, r.phone,
         r.pickup_location, r.dropoff_location, r.pickup_time,
         r.vehicle_type, r.status, r.notes,
         v.plate AS vehicle_plate,
         d.id AS driver_id, d.name AS driver_name
       FROM reservations r
       LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
       LEFT JOIN drivers  d ON d.id = r.driver_id
       WHERE r.driver_id = $1::uuid
         AND ($2::timestamptz IS NULL OR r.pickup_time >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR r.pickup_time <= $3::timestamptz)
       ORDER BY r.pickup_time ASC`,
      [driver_id, from, to]
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error("[/api/drivers/assignments] ", err);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(err?.message || err) });
  }
}

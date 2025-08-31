// /api/reservations/index.js
import { query } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const rows = await query("SELECT * FROM reservations ORDER BY id DESC");
      return res.json(rows);
    }

    if (req.method === "POST") {
      const { customer_name, pickup_location, dropoff_location, pickup_time } = req.body;
      const rows = await query(
        `INSERT INTO reservations (customer_name, pickup_location, dropoff_location, pickup_time)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [customer_name, pickup_location, dropoff_location, pickup_time]
      );
      return res.json(rows[0]);
    }

    if (req.method === "PATCH") {
      const { id, status, vehicle_id } = req.body;
      const rows = await query(
        `UPDATE reservations SET status=$2, vehicle_id=$3 WHERE id=$1 RETURNING *`,
        [id, status, vehicle_id]
      );
      return res.json(rows[0]);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[RESERVATIONS] Error:", err);
    return res.status(500).json({ error: "internal_error", details: err.message });
  }
}

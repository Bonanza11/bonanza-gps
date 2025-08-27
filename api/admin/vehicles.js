// /api/admin/vehicles.js
import pool from "../_db.js";

export default async function handler(req, res) {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT id, plate, driver_name, kind, year, model, active FROM vehicles ORDER BY created_at DESC"
      );
      return res.json({ ok: true, vehicles: rows });
    }

    if (req.method === "POST") {
      const { id, plate, driver_name, kind, year, model, active } = req.body;

      if (id) {
        // Update
        await pool.query(
          `UPDATE vehicles
           SET plate=$1, driver_name=$2, kind=$3, year=$4, model=$5, active=$6
           WHERE id=$7`,
          [plate, driver_name, kind, year, model, active, id]
        );
      } else {
        // Insert
        await pool.query(
          `INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [plate, driver_name, kind, year, model, active]
        );
      }

      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      await pool.query(`DELETE FROM vehicles WHERE id=$1`, [id]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("DB Error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

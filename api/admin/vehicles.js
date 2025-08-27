// /api/admin/vehicles.js
import { query } from "../_db.js";

export default async function handler(req, res) {
  try {
    const key = req.headers["x-admin-key"];
    if (key !== process.env.ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (req.method === "GET") {
      // Listar todos los vehículos
      const rows = await query(
        "SELECT id, plate, driver_name, kind, year, model, active FROM vehicles ORDER BY created_at DESC"
      );
      return res.json({ ok: true, vehicles: rows });
    }

    if (req.method === "POST") {
      const { id, plate, driver_name, kind, year, model, active } = req.body;

      if (!plate || !driver_name || !kind) {
        return res.status(400).json({ ok: false, error: "Missing fields" });
      }

      if (id) {
        // UPDATE existente
        await query(
          `UPDATE vehicles
           SET plate=$1, driver_name=$2, kind=$3, year=$4, model=$5, active=$6
           WHERE id=$7`,
          [plate, driver_name, kind, year || null, model || null, active ?? false, id]
        );
      } else {
        // INSERT nuevo
        await query(
          `INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [plate, driver_name, kind, year || null, model || null, active ?? false]
        );
      }
      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      await query("DELETE FROM vehicles WHERE id=$1", [id]);
      return res.json({ ok: true });
    }

    res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("vehicles.js error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

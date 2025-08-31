// PATCH: actualiza status/vehicle_id/driver/notes | GET: uno | DELETE: borra
import { query } from "../_db.js";

const ADMIN = "supersecreto123";

export default async function handler(req, res) {
  try {
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const { id } = req.query;
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

    if (req.method === "GET") {
      const rows = await query(`SELECT * FROM reservations WHERE id=$1`, [id]);
      return res.json(rows[0] || null);
    }

    if (req.method === "PATCH") {
      const { status, vehicle_id, driver_name, notes } = req.body || {};
      // Construye SET dinámico solo con campos enviados
      const fields = [];
      const vals = [];
      let idx = 1;

      if (status != null)      { fields.push(`status=$${idx++}`);      vals.push(String(status)); }
      if (vehicle_id != null)  { fields.push(`vehicle_id=$${idx++}`);  vals.push(Number(vehicle_id)); }
      if (driver_name != null) { fields.push(`driver_name=$${idx++}`); vals.push(String(driver_name)); }
      if (notes != null)       { fields.push(`notes=$${idx++}`);       vals.push(String(notes)); }

      if (!fields.length) return res.json({ ok: true }); // nada que actualizar

      vals.push(id);
      const rows = await query(
        `UPDATE reservations SET ${fields.join(", ")} WHERE id=$${idx} RETURNING *`,
        vals
      );
      return res.json(rows[0]);
    }

    if (req.method === "DELETE") {
      await query(`DELETE FROM reservations WHERE id=$1`, [id]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (err) {
    console.error("[/api/reservations/[id]] ", err);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(err.message || err) });
  }
}

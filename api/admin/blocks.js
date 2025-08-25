// /api/admin/blocks.js
import pool from "../_db.js";

const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";

export default async function handler(req, res) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT vb.id, vb.vehicle_id, v.plate, v.kind, vb.starts_at, vb.ends_at, vb.reason
         FROM vehicle_blocks vb
         JOIN vehicles v ON v.id = vb.vehicle_id
         ORDER BY vb.starts_at DESC
        `
      );
      return res.status(200).json({ ok: true, blocks: rows });
    }

    if (req.method === "POST") {
      const { vehicle_id, starts_at, ends_at, reason } = req.body || {};
      if (!vehicle_id || !starts_at || !ends_at) {
        return res.status(400).json({ error: "Missing vehicle_id/starts_at/ends_at" });
      }
      await pool.query(
        `INSERT INTO vehicle_blocks (vehicle_id, starts_at, ends_at, reason)
         VALUES ($1, $2, $3, $4)`,
        [vehicle_id, starts_at, ends_at, reason || null]
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { id } = req.query; // /api/admin/blocks?id=...
      if (!id) return res.status(400).json({ error: "Missing id" });
      await pool.query(`DELETE FROM vehicle_blocks WHERE id=$1`, [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("❌ Admin blocks error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}

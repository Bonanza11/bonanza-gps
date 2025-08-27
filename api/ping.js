// /api/ping.js
import pool from "./_db";

export default async function handler(req, res) {
  try {
    const key = req.headers["x-admin-key"] || req.query.key || "";
    if (!key || key !== process.env.ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const r = await pool.query("select 1 as ok");
    return res.status(200).json({ ok: true, db: r.rows[0].ok === 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

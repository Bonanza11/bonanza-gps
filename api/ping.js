// /api/ping.js
import { dbPing } from "./_db.js";

export default async function handler(req, res) {
  const key = req.query.key || req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  try {
    const ok = await dbPing();
    res.json({ ok: true, db: ok });
  } catch (err) {
    console.error("[PING ERROR]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

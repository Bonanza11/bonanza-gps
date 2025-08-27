// /api/ping.js
import { dbPing } from "./_db.js";

export default async function handler(req, res) {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const alive = await dbPing();
    return res.status(200).json({ ok: true, db: alive });
  } catch (err) {
    console.error("[ping] DB error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

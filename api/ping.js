// /api/ping.js
import { dbPing } from "./_db.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const alive = await dbPing();
    return res.status(200).json({
      ok: true,
      db: { alive }
    });
  } catch (err) {
    console.error("[ping] DB error:", err);
    return res.status(500).json({
      ok: false,
      error: "db_error",
      detail: process.env.NODE_ENV === "production" ? undefined : err.message
    });
  }
}

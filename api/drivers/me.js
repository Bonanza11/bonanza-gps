import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ ok:false, error:"invalid_token" }); }

    const result = await query(
      `SELECT id, name, email, phone, active, online
         FROM drivers
        WHERE id = $1
        LIMIT 1`,
      [payload.sub]
    );

    if (!result.rows?.length) return res.status(404).json({ ok:false, error:"not_found" });

    return res.json({ ok:true, driver: result.rows[0] });
  } catch (e) {
    console.error("[driver-me] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

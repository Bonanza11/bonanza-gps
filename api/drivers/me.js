// /api/driver/me.js
import { query } from "../_db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    const { rows } = await query(
      "SELECT id, name, email, phone, active, online FROM drivers WHERE id=$1 LIMIT 1",
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.json({ ok: true, driver: rows[0] });
  } catch (e) {
    console.error("[driver-me]", e);
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}

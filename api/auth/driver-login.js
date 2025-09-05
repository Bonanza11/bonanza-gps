// /api/auth/driver-login.js
import { query } from "../_db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ ok:false, error:"missing_fields" });
  }

  try {
    // busca chofer activo
    const { rows } = await query(
      `select id, name, email, pin, active 
       from drivers 
       where lower(email)=lower($1) limit 1`,
      [email]
    );

    if (!rows[0]) {
      return res.status(401).json({ ok:false, error:"driver_not_found" });
    }

    const d = rows[0];
    if (!d.active) {
      return res.status(403).json({ ok:false, error:"inactive_driver" });
    }
    if (String(d.pin) !== String(code)) {
      return res.status(401).json({ ok:false, error:"wrong_pin" });
    }

    const token = jwt.sign(
      { sub: d.id, role:"DRIVER" },
      JWT_SECRET,
      { expiresIn:"12h" }
    );

    return res.json({ ok:true, token });
  } catch (e) {
    console.error("[driver-login]", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

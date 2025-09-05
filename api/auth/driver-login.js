// /api/auth/driver-login.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  try {
    const { email, code } = (req.body || {});
    if (!email || !code) {
      return res.status(400).json({ ok:false, error:"missing_fields" });
    }

    // NOTA: email::text ILIKE $1 para evitar problemas con dominios/citext
    const { rows } = await query(
      `select id, name, email::text as email, phone, pin, active, online
         from drivers
        where email::text ILIKE $1
          and active = true
        limit 1`,
      [email]
    );

    const drv = rows[0];
    if (!drv) {
      return res.status(401).json({ ok:false, error:"driver_not_found" });
    }
    if (String(drv.pin || "") !== String(code || "")) {
      return res.status(401).json({ ok:false, error:"invalid_code" });
    }

    // Emitimos token simple con rol DRIVER
    const token = jwt.sign(
      { sub: drv.id, roles: ["DRIVER"] },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      token,
      driver: {
        id: drv.id,
        name: drv.name,
        email: drv.email,
        phone: drv.phone,
        online: !!drv.online,
        active: !!drv.active,
      }
    });
  } catch (e) {
    console.error("[driver-login]", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

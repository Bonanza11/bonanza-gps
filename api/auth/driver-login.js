// /api/auth/driver-login.js
import { query } from "../_db.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }

    // Buscar al driver en la base
    const { rows } = await query(
      `SELECT id, name, email, phone, pin, active, online 
       FROM drivers 
       WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ ok: false, error: "driver_not_found" });
    }

    const driver = rows[0];

    // Comparar el PIN
    if (String(driver.pin) !== String(code)) {
      return res.status(401).json({ ok: false, error: "invalid_pin" });
    }

    if (!driver.active) {
      return res.status(403).json({ ok: false, error: "driver_inactive" });
    }

    // Crear token JWT
    const token = jwt.sign(
      { sub: driver.id, role: "DRIVER" },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({ ok: true, token, driver });

  } catch (e) {
    console.error("[driver-login] error", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

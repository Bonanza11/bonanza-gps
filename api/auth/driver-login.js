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

    // Buscar driver por email
    const { rows } = await query(
      "SELECT id, email, name, phone, pin, active FROM drivers WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );
    if (!rows[0]) {
      return res.status(401).json({ ok: false, error: "invalid_login" });
    }

    const driver = rows[0];
    // Comparar PIN (string directo por ahora)
    const match = String(code) === String(driver.pin);
    if (!match) {
      return res.status(401).json({ ok: false, error: "invalid_login" });
    }

    // Crear token JWT
    const token = jwt.sign(
      { sub: driver.id, role: "DRIVER" },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ ok: true, token, driver });
  } catch (e) {
    console.error("[driver-login]", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

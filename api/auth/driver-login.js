// /api/auth/driver-login.js
import { query } from "../_db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  try {
    // Busca el driver por email
    const { rows } = await query(
      `SELECT id, name, email, phone, active, online, password_hash
       FROM drivers
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );

    const d = rows[0];
    if (!d) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (d.active === false) {
      return res.status(403).json({ ok: false, error: "inactive_driver" });
    }
    if (!d.password_hash) {
      // Seguridad: si no hay hash, fuerza error (no caigas al PIN plano)
      return res.status(500).json({ ok: false, error: "missing_password_hash" });
    }

    const ok = await bcrypt.compare(String(code), d.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    // Emite JWT con rol DRIVER
    const token = jwt.sign({ sub: d.id, roles: ["DRIVER"] }, JWT_SECRET, {
      expiresIn: "12h",
    });

    // No expongas password_hash
    const driver = {
      id: d.id,
      name: d.name,
      email: d.email,
      phone: d.phone,
      active: d.active,
      online: d.online,
    };

    return res.json({ ok: true, token, driver });
  } catch (e) {
    console.error("[driver-login] error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

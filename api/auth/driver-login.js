// /api/auth/driver-login.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    // lee cuerpo (soporta body como string u objeto)
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch {}
    }
    const email = (body?.email || "").trim();
    const pin   = (body?.code  || body?.pin || "").trim();

    if (!email || !pin) {
      return res.status(400).json({ ok:false, error:"missing_email_or_pin" });
    }

    // busca chofer por email (case-insensitive)
    const { rows } = await query(
      `select id, name, email, active, pin
         from drivers
        where lower(email) = lower($1)
        limit 1`,
      [email]
    );

    // si no existe, responde con 401 en vez de reventar
    if (!rows || rows.length === 0) {
      return res.status(401).json({ ok:false, error:"driver_not_found" });
    }

    const d = rows[0];

    // activo?
    if (d.active === false) {
      return res.status(403).json({ ok:false, error:"driver_inactive" });
    }

    // valida PIN (texto simple)
    if (String(d.pin || "") !== String(pin)) {
      return res.status(401).json({ ok:false, error:"wrong_pin" });
    }

    // genera JWT
    const token = jwt.sign(
      { sub: d.id, roles: ["DRIVER"] },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ ok:true, token });

  } catch (e) {
    console.error("[driver-login] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

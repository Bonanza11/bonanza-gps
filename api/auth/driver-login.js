// /api/auth/driver-login.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";          // tu helper de DB (devuelve un ARRAY de filas)

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    // Body (Vercel normalmente ya lo parsea)
    let body = req.body;
    if (!body) {
      const raw = await new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(data));
      });
      if (raw) { try { body = JSON.parse(raw); } catch {} }
    }

    const email = String(body?.email || "").trim().toLowerCase();
    const code  = String(body?.code  || body?.pin || "").trim();
    if (!email || !code) {
      return res.status(400).json({ ok:false, error:"missing_credentials" });
    }

    // Busca driver (query() -> array de filas)
    const rows = await query(
      `select id, name, email, phone, pin, active, online
         from drivers
        where lower(email) = lower($1)
        limit 1`,
      [email]
    );
    const d = rows?.[0];

    if (!d) {
      return res.status(401).json({ ok:false, error:"driver_not_found" });
    }
    if (d.active === false) {
      return res.status(403).json({ ok:false, error:"driver_inactive" });
    }

    // Valida PIN
    const okPin = String(d.pin ?? "").trim() === code;
    if (!okPin) {
      return res.status(401).json({ ok:false, error:"bad_pin" });
    }

    // Token de 30 días
    const token = jwt.sign(
      { sub: d.id, roles: ["DRIVER"] },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const driver = {
      id: d.id, name: d.name, email: d.email, phone: d.phone,
      active: d.active, online: d.online
    };

    return res.json({ ok:true, token, driver });
  } catch (e) {
    console.error("[driver-login] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

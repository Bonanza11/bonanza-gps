// api/auth/driver-login.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("[AUTH] Missing JWT_SECRET");

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

// comparación de PIN con timing-safe si longitudes coinciden
function safeComparePin(storedPin, providedPin) {
  const a = Buffer.from(String(storedPin || ""), "utf8");
  const b = Buffer.from(String(providedPin || ""), "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); }
  catch { return false; }
}

export default async function handler(req, res) {
  // Preflight / CORS básico (si usas un proxy que haga OPTIONS)
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body : await parseJsonBody(req);
    const email = String(body?.email || "").trim().toLowerCase();
    const code  = String(body?.code  || body?.pin || "").trim();

    if (!email || !code) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }

    // Busca el chofer por email (activo o no; validamos después)
    const result = await query(
      `select id, name, email, phone, pin, active, online
         from drivers
        where lower(email) = lower($1)
        limit 1`,
      [email]
    );

    const d = result?.rows?.[0];

    // Por seguridad devolvemos 401 genérico si no existe o el pin no coincide
    if (!d || !safeComparePin(d.pin, code)) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    if (d.active === false) {
      return res.status(403).json({ ok: false, error: "driver_inactive" });
    }

    // Payload del JWT con claims útiles
    const token = jwt.sign(
      {
        sub: d.id,
        role: "DRIVER",                // también puedes añadir roles: ["DRIVER"]
        email: d.email,
        name: d.name,
      },
      JWT_SECRET,
      { expiresIn: "30d", audience: "bonanza.drivers", issuer: "bonanza-gps" }
    );

    // (Opcional) marcar último login
    try {
      await query(`update drivers set last_login_at = now() where id = $1`, [d.id]);
    } catch { /* no bloquear por esto */ }

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

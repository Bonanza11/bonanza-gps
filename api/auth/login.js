// /api/auth/login.js
import { query } from "../_db.js";
import jwt from "jsonwebtoken";

export const config = { runtime: "nodejs" };

const JWT_SECRET = process.env.JWT_SECRET; // Configúralo en Vercel

function bad(res) { return res.status(401).json({ ok:false, error:"invalid_credentials" }); }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok:false, error:"method_not_allowed" });
    }

    const { username, password } = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    if (!username || !password) return bad(res);

    // ❗ Ajusta esta consulta a tu esquema real:
    const { rows } = await query(
      `select id, username, role, password_hash from users where username=$1 limit 1`,
      [username]
    );
    if (!rows.length) return bad(res);

    const user = rows[0];

    // ❗ Valida la contraseña como corresponda (bcrypt, etc.)
    // Ejemplo “dummy” (cámbialo por bcrypt.compare):
    const okPass = password === process.env.DEMO_PASSWORD; // SOLO TEMPORAL PARA PROBAR
    if (!okPass) return bad(res);

    // Payload mínimo del token
    const payload = {
      sub: String(user.id),
      username: user.username,
      roles: [user.role], // ajusta si tienes múltiples roles
    };

    const token = jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn: "24h" });
    return res.json({ ok: true, token, user: payload });
  } catch (e) {
    console.error("[/api/auth/login] ", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

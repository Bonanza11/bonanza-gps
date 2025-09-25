// ===========================================================
// Bonanza Transportation - Simple Admin Login (ENV-based)
// Archivo: bonanza-gps/api/auth/login.js
// ===========================================================
export const config = { runtime: "nodejs" };

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

/**
 * Opciones de usuarios:
 * A) ADMIN_USERS (JSON array):
 *    [{"id":"<uuid|slug>","username":"Dinastia","password":"supersecreto123","roles":["OWNER","ADMIN","DISPATCHER"]}]
 * B) Variables simples:
 *    ADMIN_USER=Dinastia
 *    ADMIN_PASS=supersecreto123
 *    ADMIN_ROLES=OWNER,ADMIN,DISPATCHER
 *    ADMIN_ID=<uuid|slug opcional>  (si no pones, usamos el username como sub)
 */
function loadUsers() {
  try {
    if (process.env.ADMIN_USERS) {
      const arr = JSON.parse(process.env.ADMIN_USERS);
      if (Array.isArray(arr)) {
        return arr
          .map(u => ({
            id: (u.id ?? u.user_id ?? u.username ?? "").toString().trim(),
            username: (u.username ?? "").toString().trim(),
            password: (u.password ?? "").toString(),
            roles: Array.isArray(u.roles) ? u.roles : ["OWNER","ADMIN","DISPATCHER"]
          }))
          .filter(u => u.username && u.password);
      }
    }
  } catch (e) {
    console.error("[/api/login] ADMIN_USERS JSON parse error:", e);
  }

  const username = (process.env.ADMIN_USER || "").trim();
  const password = process.env.ADMIN_PASS || "";
  const roles = (process.env.ADMIN_ROLES || "OWNER,ADMIN,DISPATCHER")
    .split(",").map(s => s.trim()).filter(Boolean);
  const id = (process.env.ADMIN_ID || username || "").trim();

  return (username && password) ? [{ id, username, password, roles }] : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  try {
    const { username, password, remember = false } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok:false, error:"missing_credentials" });
    }

    const users = loadUsers();
    const user = users.find(
      u => u.username.toLowerCase() === String(username).toLowerCase()
    );
    // comparación simple (al ser ENV, no hay hash)
    if (!user || user.password !== password) {
      return res.status(401).json({ ok:false, error:"invalid_credentials" });
    }

    // sub = id si lo tienes; si no, caemos al username (compatible con tu guard)
    const sub = user.id || user.username;
    const roles = user.roles ?? ["ADMIN"];

    const expiresIn = remember ? "7d" : "1d";
    const token = jwt.sign(
      { sub, roles, typ: "access", iss: "bonanza-hq", aud: "bonanza-admin" },
      JWT_SECRET,
      { expiresIn }
    );

    return res.json({
      ok: true,
      token,
      user: { id: sub, username: user.username, roles },
      expiresIn
    });
  } catch (e) {
    console.error("[/api/login] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

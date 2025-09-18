// /api/login.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

/**
 * Dónde definimos usuarios:
 * Opción A) ADMIN_USERS como JSON, ej:
 *   ADMIN_USERS=[{"username":"Dinastia","password":"superscreto123","roles":["OWNER","ADMIN","DISPATCHER"]}]
 *
 * Opción B) Variables simples:
 *   ADMIN_USER=Dinastia
 *   ADMIN_PASS=superscreto123
 *   ADMIN_ROLES=OWNER,ADMIN,DISPATCHER
 */
function loadUsers() {
  try {
    if (process.env.ADMIN_USERS) {
      const arr = JSON.parse(process.env.ADMIN_USERS);
      if (Array.isArray(arr)) return arr.map(u => ({
        username: String(u.username || "").trim(),
        password: String(u.password || ""),
        roles: Array.isArray(u.roles) ? u.roles : ["OWNER","ADMIN","DISPATCHER"]
      }));
    }
  } catch (e) {
    console.error("[/api/login] ADMIN_USERS JSON parse error:", e);
  }

  // fallback simple
  const u = (process.env.ADMIN_USER || "").trim();
  const p = process.env.ADMIN_PASS || "";
  const r = (process.env.ADMIN_ROLES || "OWNER,ADMIN,DISPATCHER")
              .split(",").map(s => s.trim()).filter(Boolean);
  return u && p ? [{ username: u, password: p, roles: r }] : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const { username, password, remember = false } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }

    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user || user.password !== password) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    // Token 1 día (o 7 días si remember)
    const expiresIn = remember ? "7d" : "1d";
    const token = jwt.sign(
      { sub: user.username, roles: user.roles },
      JWT_SECRET,
      { expiresIn }
    );

    return res.json({
      ok: true,
      token,
      user: { username: user.username, roles: user.roles },
      expiresIn
    });
  } catch (e) {
    console.error("[/api/login] error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

// api/_lib/guard.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_KEY  = process.env.ADMIN_KEY || null;
const JWT_AUD    = process.env.JWT_AUD || "";     // opcional: "bonanza.drivers"
const JWT_ISS    = process.env.JWT_ISS || "";     // opcional: "bonanza-gps"

if (!JWT_SECRET) throw new Error("[AUTH] Missing JWT_SECRET");
if (!ADMIN_KEY)  console.warn("[AUTH] ADMIN_KEY not set; HQ bypass disabled");

/**
 * Extrae el token desde:
 * - Authorization: Bearer <token>
 * - cookie "auth_token" (útil en páginas)
 */
function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  const cookie = req.headers.cookie || "";
  const m = cookie.match(/\bauth_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);

  return null;
}

function verifyToken(token) {
  const opts = {};
  if (JWT_AUD) opts.audience = JWT_AUD;
  if (JWT_ISS) opts.issuer   = JWT_ISS;
  return jwt.verify(token, JWT_SECRET, opts);
}

/**
 * Middleware HOF para proteger handlers con roles opcionales.
 * @param {string[]} allowedRoles - p.ej. ["DRIVER"] o ["ADMIN","DISPATCHER"]
 */
export function requireAuth(allowedRoles = []) {
  return (handler) => async (req, res) => {
    try {
      // Preflight: deja pasar sin ruido
      if (req.method === "OPTIONS") {
        res.setHeader("Allow", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
        return res.status(204).end();
      }

      // Bypass HQ por header secreto
      if (ADMIN_KEY && req.headers["x-admin-key"] === ADMIN_KEY) {
        req.user = { id: "hq-admin", roles: ["OWNER","ADMIN","DISPATCHER"], name: "HQ", email: "" };
        return await handler(req, res);
      }

      const token = extractToken(req);
      if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

      const p = verifyToken(token);

      // Normalizamos roles (acepta 'role' y/o 'roles')
      const roles = Array.isArray(p.roles) ? p.roles : (p.role ? [p.role] : []);
      if (allowedRoles.length > 0 && !roles.some(r => allowedRoles.includes(r))) {
        return res.status(403).json({ ok:false, error:"forbidden" });
      }

      // Enriquecemos req.user (id/email/name si existen en el JWT)
      req.user = {
        id: p.sub,
        roles,
        email: p.email || undefined,
        name:  p.name  || undefined,
      };

      return await handler(req, res);
    } catch (e) {
      // Diferenciar errores de firma vs. otros
      const code = e?.name === "TokenExpiredError" || e?.name === "JsonWebTokenError"
        ? 401 : 401;
      console.error("[requireAuth]", e?.message || e);
      return res.status(code).json({ ok:false, error:"invalid_token" });
    }
  };
}

/* ===== Helpers de azúcar sintáctico ===== */

// Solo choferes
export const requireDriver = (handler) => requireAuth(["DRIVER"])(handler);

// Solo HQ (admin/dispatcher/owner)
export const requireAdmin = (handler) => requireAuth(["ADMIN","DISPATCHER","OWNER"])(handler);

// Cualquier usuario autenticado (sin filtrar por rol)
export const requireAny = (handler) => requireAuth([])(handler);

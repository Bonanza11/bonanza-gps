// /api/_lib/guard.js (seguro, sin master key)
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET; // ← DEBE existir en Vercel

export function requireAuth(allowedRoles = []) {
  if (!JWT_SECRET) {
    // ayuda para detectar faltas de config en deploys
    console.warn("[guard] Missing JWT_SECRET env var");
  }

  return (handler) => async (req, res) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

      const payload = jwt.verify(token, JWT_SECRET); // { sub, roles? }
      const roles = payload.roles || (payload.role ? [payload.role] : []);
      if (allowedRoles.length && !roles.some(r => allowedRoles.includes(r))) {
        return res.status(403).json({ ok:false, error:"forbidden" });
      }

      req.user = { id: payload.sub, roles };
      return handler(req, res);
    } catch (e) {
      console.error("[requireAuth]", e);
      return res.status(401).json({ ok:false, error:"invalid_token" });
    }
  };

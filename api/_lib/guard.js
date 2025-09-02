// /api/_lib/guard.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";
const ADMIN_KEY  = process.env.ADMIN_KEY  || "supersecreto123";

export function requireAuth(allowedRoles = []) {
  return (handler) => async (req, res) => {
    try {
      // 1) Atajo HQ por x-admin-key
      if (req.headers["x-admin-key"] === ADMIN_KEY) {
        req.user = { id: "hq-admin", roles: ["OWNER","ADMIN","DISPATCHER"] };
        return await handler(req, res);          // ← AQUI
      }

      // 2) Bearer JWT
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

      const payload = jwt.verify(token, JWT_SECRET); // { sub, roles? }
      const roles = payload.roles || (payload.role ? [payload.role] : []);
      if (allowedRoles.length && !roles.some(r => allowedRoles.includes(r))) {
        return res.status(403).json({ ok:false, error:"forbidden" });
      }
      req.user = { id: payload.sub, roles };
      return await handler(req, res);            // ← Y AQUI
    } catch (e) {
      console.error("[requireAuth]", e);
      return res.status(401).json({ ok:false, error:"invalid_token" });
    }
  };
}

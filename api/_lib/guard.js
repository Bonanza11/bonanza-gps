import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_KEY  = process.env.ADMIN_KEY;

if (!JWT_SECRET) throw new Error("[AUTH] Missing JWT_SECRET");
if (!ADMIN_KEY)  console.warn("[AUTH] ADMIN_KEY not set; HQ bypass disabled");

export function requireAuth(allowedRoles = []) {
  return (handler) => async (req, res) => {
    try {
      // Atajo HQ
      if (ADMIN_KEY && req.headers["x-admin-key"] === ADMIN_KEY) {
        req.user = { id: "hq-admin", roles: ["OWNER","ADMIN","DISPATCHER"] };
        return await handler(req, res);
      }

      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

      const payload = jwt.verify(token, JWT_SECRET);
      const roles = payload.roles || (payload.role ? [payload.role] : []);
      if (allowedRoles.length && !roles.some(r => allowedRoles.includes(r))) {
        return res.status(403).json({ ok:false, error:"forbidden" });
      }

      req.user = { id: payload.sub, roles };
      return await handler(req, res);
    } catch (e) {
      console.error("[requireAuth]", e);
      return res.status(401).json({ ok:false, error:"invalid_token" });
    }
  };
}

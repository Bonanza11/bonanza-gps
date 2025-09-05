// /api/drivers/me.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dinastia0987654321";

// helper para leer/parsear body si hiciera falta
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    // --- Auth: Bearer JWT ---
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET); // { sub, roles }
    } catch {
      return res.status(401).json({ ok:false, error:"invalid_token" });
    }

    const driverId = payload.sub;

    // --- PATCH: toggle online ---
    if (req.method === "PATCH") {
      const body = await readJson(req);
      const online = body?.online;
      if (typeof online !== "boolean") {
        return res.status(400).json({ ok:false, error:"invalid_online" });
      }
      const up = await query(
        `update drivers
           set online = $2, updated_at = now()
         where id = $1
         returning id, name, email, phone, active, online`,
        [driverId, online]
      );
      if (!up.rows?.[0]) return res.status(404).json({ ok:false, error:"not_found" });
      return res.json({ ok:true, driver: up.rows[0] });
    }

    // --- GET: perfil + vehículos ---
    if (req.method === "GET") {
      const d = await query(
        `select id, name, email, phone, active, online
           from drivers
          where id = $1
          limit 1`,
        [driverId]
      );
      if (!d.rows?.[0]) return res.status(404).json({ ok:false, error:"not_found" });

      const veh = await query(
        `select id, plate, kind, year, model, active, driver_id
           from vehicles
          where driver_id = $1
          order by kind asc, plate asc`,
        [driverId]
      );

      return res.json({ ok:true, driver: d.rows[0], vehicles: veh.rows || [] });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  } catch (e) {
    console.error("[driver-me] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

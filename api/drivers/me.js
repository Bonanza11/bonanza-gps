// /api/drivers/me.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET; // usa tu var en Vercel

export default async function handler(req, res) {
  try {
    // --- Auth: Bearer <token> ---
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ ok:false, error:"invalid_token" }); }

    const driverId = payload.sub;

    if (req.method === "GET") {
      // Perfil + vehículos
      const d = await query(
        `select id, name, email, phone, active, online
           from drivers
          where id = $1
          limit 1`,
        [driverId]
      );
      if (!d.rows?.length) return res.status(404).json({ ok:false, error:"not_found" });

      const v = await query(
        `select id, plate, kind, year, model, active
           from vehicles
          where driver_id = $1
          order by kind asc, plate asc`,
        [driverId]
      );

      return res.json({ ok:true, driver: d.rows[0], vehicles: v.rows || [] });
    }

    if (req.method === "PATCH") {
      // Toggle online
      let body = req.body;
      if (!body) {
        const raw = await new Promise((resolve)=>{
          let data=""; req.on("data",c=>data+=c); req.on("end",()=>resolve(data));
        });
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      }

      const online = body?.online;
      if (typeof online !== "boolean") {
        return res.status(400).json({ ok:false, error:"invalid_online" });
      }

      const up = await query(
        `update drivers
            set online = $2
          where id = $1
          returning id, name, email, phone, active, online`,
        [driverId, online]
      );
      if (!up.rows?.length) return res.status(404).json({ ok:false, error:"not_found" });

      return res.json({ ok:true, driver: up.rows[0] });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });

  } catch (e) {
    console.error("[drivers/me] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

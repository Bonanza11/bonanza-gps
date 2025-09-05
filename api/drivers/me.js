import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("[AUTH] Missing JWT_SECRET");

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload?.sub;
    if (!userId) return res.status(401).json({ ok:false, error:"no_sub" });

    const drv = await query(
      `select id, name, email, phone, active, online
         from drivers
        where id = $1
        limit 1`,
      [userId]
    );
    const d = drv?.rows?.[0];
    if (!d) return res.status(404).json({ ok:false, error:"driver_not_found" });

    if (req.method === "PATCH") {
      const { online } = req.body || {};
      if (typeof online !== "boolean") {
        return res.status(400).json({ ok:false, error:"invalid_online" });
      }
      const up = await query(`update drivers set online = $2 where id = $1 returning online`, [d.id, online]);
      return res.json({ ok:true, driver: { ...d, online: up.rows[0].online } });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow","GET, PATCH");
      return res.status(405).json({ ok:false, error:"method_not_allowed" });
    }

    const veh = await query(
      `select id, plate, kind, year, model, active, driver_id
         from vehicles
        where driver_id = $1
        order by kind asc, plate asc`,
      [d.id]
    );

    return res.json({ ok:true, driver:d, vehicles:veh.rows || [] });
  } catch (e) {
    console.error("[driver/me]", e);
    return res.status(401).json({ ok:false, error:"invalid_token" });
  }
}

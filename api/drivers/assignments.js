// /api/drivers/assignments.js
import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  try {
    // Auth Driver (Bearer)
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ ok:false, error:"invalid_token" }); }

    const driverId = payload.sub;

    if (req.method === "GET") {
      const { rows } = await query(
        `SELECT id, status, customer_name, phone,
                pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE driver_id = $1::uuid
          ORDER BY pickup_time ASC NULLS LAST, id ASC`,
        [driverId]
      );
      return res.json({ ok:true, rows });
    }

    if (req.method === "PATCH") {
      let body = req.body;
      if (!body) {
        const raw = await new Promise((resolve) => {
          let data=""; req.on("data",c=>data+=c); req.on("end",()=>resolve(data));
        });
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      }
      const id = Number(body?.id);
      const status = String(body?.status || "").toUpperCase().trim();
      const allowed = new Set(["PENDING","ASSIGNED","STARTED","ARRIVED","DONE","CANCELLED"]);
      if (!Number.isInteger(id)) return res.status(400).json({ ok:false, error:"missing_id" });
      if (!allowed.has(status)) return res.status(400).json({ ok:false, error:"bad_status" });

      const { rows } = await query(
        `UPDATE reservations
            SET status=$2, updated_at = now()
          WHERE id=$1 AND driver_id=$3::uuid
        RETURNING id, status`,
        [id, status, driverId]
      );
      if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });
      return res.json({ ok:true, updated: rows[0] });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });

  } catch (e) {
    console.error("[drivers/assignments] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

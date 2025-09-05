import jwt from "jsonwebtoken";
import { query } from "../_db.js";

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok:false, error:"missing_token" });

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ ok:false, error:"invalid_token" }); }

    const driverRes = await query(
      `SELECT id, name, email, phone, active, online
         FROM drivers
        WHERE id = $1 LIMIT 1`,
      [payload.sub]
    );
    const driver = driverRes.rows?.[0];
    if (!driver) return res.status(404).json({ ok:false, error:"driver_not_found" });

    const veh = await query(
      `SELECT id, plate, kind, year, model, active, driver_id
         FROM vehicles
        WHERE driver_id = $1
        ORDER BY kind ASC, plate ASC`,
      [driver.id]
    );

    return res.json({ ok:true, driver, vehicles:veh.rows });
  } catch (e) {
    console.error("[assignments] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

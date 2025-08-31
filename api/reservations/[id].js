// /api/reservations/[id].js
import { pool } from "../_db.js";

export default async function handler(req, res){
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok:false, error:"Method Not Allowed" });
  }
  try{
    const id = req.query.id;
    const { status, vehicle_id, driver_name, notes } = req.body || {};

    const sets = [];
    const vals = [];
    let i = 1;

    if (status)       { sets.push(`status = $${i++}`);      vals.push(String(status)); }
    if (vehicle_id!=null && vehicle_id!=='') {
      sets.push(`vehicle_id = $${i++}`); vals.push(parseInt(vehicle_id,10));
    }
    if (driver_name!==undefined) { sets.push(`driver_name = $${i++}`); vals.push(driver_name || null); }
    if (notes!==undefined)       { sets.push(`notes = $${i++}`);       vals.push(notes || null); }

    if (!sets.length) return res.json({ ok:true }); // nada que actualizar

    vals.push(id);
    const sql = `update reservations set ${sets.join(", ")} where id = $${i} returning *`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ ok:false, error:"Not found" });
    return res.json({ ok:true, reservation: rows[0] });
  }catch(e){
    console.error("[/api/reservations/:id] error:", e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

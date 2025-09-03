// /api/driver/me.js
import { query } from "../_lib/db.js";
import { requireAuth } from "../_lib/guard.js";

export default requireAuth(["DRIVER"])(async (req, res) => {
  try {
    const id = req.user.id;

    if (req.method === "GET") {
      const rows = await query(
        "select id, name, email, phone, active, online from drivers where id=$1",
        [id]
      );
      const me = rows[0] || null;

      const vehicles = await query(
        "select id, plate, kind, year, model, active from vehicles where driver_id=$1",
        [id]
      );

      return res.json({ ok:true, driver: me, vehicles });
    }

    if (req.method === "PATCH") {
      const { online } = req.body || {};
      const rows = await query(
        "update drivers set online=$2 where id=$1 returning id, name, email, phone, active, online",
        [id, online]
      );
      return res.json({ ok:true, driver: rows[0] });
    }

    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  } catch (e) {
    console.error("[driver/me]", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
});

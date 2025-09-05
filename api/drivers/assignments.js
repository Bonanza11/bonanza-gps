import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

async function handler(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok:false, error:"no_sub" });

  let { driver_id, driver_email, from, to } = req.query || {};
  driver_id = (driver_id || "").trim();
  driver_email = (driver_email || "").trim();

  let actingDriverId = null;
  if (req.user?.roles?.includes("DRIVER")) {
    actingDriverId = userId;
  } else {
    if (!driver_id && driver_email) {
      const found = await query(`select id from drivers where lower(email)=lower($1) limit 1`, [driver_email]);
      driver_id = found.rows?.[0]?.id || "";
    }
    actingDriverId = driver_id || null;
  }

  if (!actingDriverId) return res.status(400).json({ ok:false, error:"missing_driver_ref" });

  if (req.method === "PATCH") {
    const { id, status } = req.body || {};
    if (!id || !status) return res.status(400).json({ ok:false, error:"missing_fields" });

    const up = await query(
      `update reservations
          set status = $2
        where id = $1 and driver_id = $3
        returning id, status`,
      [id, String(status||"").toUpperCase(), actingDriverId]
    );
    if (!up.rows?.[0]) return res.status(404).json({ ok:false, error:"not_found_or_forbidden" });
    return res.json({ ok:true, row: up.rows[0] });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow","GET, PATCH");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  const { rows } = await query(
    `select r.id, r.customer_name, r.email, r.phone,
            r.pickup_location, r.dropoff_location, r.pickup_time,
            r.vehicle_type, r.status, r.notes,
            v.plate as vehicle_plate
       from reservations r
       left join vehicles v on v.id = r.vehicle_id
      where r.driver_id = $1::uuid
        and ($2::timestamptz is null or r.pickup_time >= $2::timestamptz)
        and ($3::timestamptz is null or r.pickup_time <= $3::timestamptz)
      order by r.pickup_time asc`,
    [actingDriverId, from || null, to || null]
  );

  return res.json({ ok:true, rows });
}

export default requireAuth(["DRIVER","DISPATCHER","ADMIN","OWNER"])(handler);

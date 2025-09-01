// /api/drivers/assignments.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js"; // <- usa tu guard

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // parámetros (solo HQ puede usarlos)
  let { driver_id, driver_email, from, to } = req.query || {};
  driver_id = (driver_id || "").trim();
  driver_email = (driver_email || "").trim();

  // Si es DRIVER autenticado, ignoramos params y lo mapeamos a su driver_id
  let actingDriverId = null;
  if (req.user?.roles?.includes("DRIVER")) {
    const { rows: d } = await query(
      `select id from drivers where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!d[0]) return res.status(404).json({ ok:false, error: "driver_profile_not_found" });
    actingDriverId = d[0].id;
  } else {
    // HQ: si no viene driver_id pero sí email, resolverlo
    if (!driver_id && driver_email) {
      const found = await query(
        `select id from drivers where lower(email)=lower($1) limit 1`,
        [driver_email]
      );
      driver_id = found.rows?.[0]?.id || "";
    }
    actingDriverId = driver_id || null;
  }

  if (!actingDriverId) {
    return res.status(400).json({ ok: false, error: "missing_driver_ref" });
  }

  // Ventana por defecto: -6h a +48h
  const fromTs = from || null;
  const toTs   = to   || null;

  const { rows } = await query(
    `select
        r.id,
        r.customer_name, r.email, r.phone,
        r.pickup_location, r.dropoff_location, r.pickup_time,
        r.vehicle_type, r.status, r.notes,
        v.plate as vehicle_plate,
        d.id   as driver_id, d.name as driver_name, d.email as driver_email
     from reservations r
     left join vehicles v on v.id = r.vehicle_id
     left join drivers  d on d.id = r.driver_id
     where r.driver_id = $1::uuid
       and ($2::timestamptz is null or r.pickup_time >= $2::timestamptz)
       and ($3::timestamptz is null or r.pickup_time <= $3::timestamptz)
     order by r.pickup_time asc`,
    [actingDriverId, fromTs, toTs]
  );

  return res.json({ ok: true, rows });
}

export default requireAuth(["DRIVER","DISPATCHER","ADMIN","OWNER"])(handler);

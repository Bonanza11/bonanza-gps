// /api/driver/me.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

// GET  : retorna perfil del chofer + sus vehículos
// PATCH: { online: boolean } -> actualiza estado online
async function handler(req, res) {
  // Solo DRIVER, DISPATCHER, ADMIN u OWNER
  const userId = req.user?.id; // viene del JWT (payload.sub)
  if (!userId) return res.status(401).json({ ok: false, error: "no_sub" });

  // Mapea userId -> driver.id
  const drvQ = await query(
    `select d.id, d.name, d.email, d.phone, d.active, d.online
       from drivers d
      where d.id = $1
         or d.user_id = $1
      limit 1`,
    [userId]
  );
  const d = drvQ.rows[0];
  if (!d) return res.status(404).json({ ok: false, error: "driver_not_found" });

  if (req.method === "PATCH") {
    const { online } = req.body || {};
    if (typeof online !== "boolean") {
      return res.status(400).json({ ok: false, error: "invalid_online" });
    }
    const up = await query(
      `update drivers set online = $2 where id = $1 returning online`,
      [d.id, online]
    );
    return res.json({ ok: true, driver: { ...d, online: up.rows[0].online } });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // Vehículos asignados a este driver
  const veh = await query(
    `select id, plate, kind, year, model, active, driver_id
       from vehicles
      where driver_id = $1
      order by kind asc, plate asc`,
    [d.id]
  );

  return res.json({
    ok: true,
    driver: d,
    vehicles: veh.rows || [],
  });
}

export default requireAuth(["DRIVER", "DISPATCHER", "ADMIN", "OWNER"])(handler);

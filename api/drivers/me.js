// /api/drivers/me.js
import { requireAuth } from "../_lib/guard.js";
import { query } from "../_db.js";

// Roles que pueden pegarle a este endpoint
const ALLOWED = ["DRIVER", "ADMIN", "DISPATCHER", "OWNER"];

async function handler(req, res) {
  try {
    // --------- Identidad del solicitante ---------
    // req.user viene del guard: { id, roles, email?, name? }
    const roles = req.user?.roles || [];
    const isHQ  = roles.some(r => ["ADMIN","DISPATCHER","OWNER"].includes(r));

    // Regla general: si es DRIVER → solo su propio perfil.
    // Si es HQ → puede pasar ?id=<driver_id> para consultar otro driver.
    const requestedId =
      (isHQ && req.method === "GET" && req.query?.id) ? String(req.query.id) : String(req.user.id);

    // --------- Métodos ---------
    if (req.method === "GET") {
      // Perfil
      const d = await query(
        `SELECT id, name, email, phone, active, online
           FROM drivers
          WHERE id = $1
          LIMIT 1`,
        [requestedId]
      );
      if (!d.rows?.length) return res.status(404).json({ ok:false, error:"not_found" });

      // Vehículos asignados
      const v = await query(
        `SELECT id, plate, kind, year, model, active
           FROM vehicles
          WHERE driver_id = $1
          ORDER BY kind ASC, plate ASC`,
        [requestedId]
      );

      return res.json({ ok:true, driver: d.rows[0], vehicles: v.rows || [] });
    }

    if (req.method === "PATCH") {
      // Solo el propio driver puede togglear su online,
      // o HQ puede togglear si manda ?id=<driver_id>.
      // Body seguro:
      let body = req.body;
      if (!body || typeof body !== "object") {
        const raw = await new Promise((resolve) => {
          let data = ""; req.on("data", c => data += c); req.on("end", () => resolve(data));
        });
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      }

      if (!Object.prototype.hasOwnProperty.call(body, "online")) {
        return res.status(400).json({ ok:false, error:"invalid_online" });
      }
      const online = body.online;
      if (typeof online !== "boolean") {
        return res.status(400).json({ ok:false, error:"invalid_online" });
      }

      const up = await query(
        `UPDATE drivers
            SET online = $2
          WHERE id = $1
          RETURNING id, name, email, phone, active, online`,
        [requestedId, online]
      );
      if (!up.rows?.length) return res.status(404).json({ ok:false, error:"not_found" });

      return res.json({ ok:true, driver: up.rows[0] });
    }

    res.setHeader("Allow", "GET, PATCH, OPTIONS");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });

  } catch (e) {
    console.error("[drivers/me] error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

// Protegemos con guard: acepta DRIVER y HQ (ADMIN/DISPATCHER/OWNER)
export default requireAuth(ALLOWED)(handler);

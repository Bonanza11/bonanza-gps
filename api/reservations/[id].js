// /api/reservations/[id].js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

// Normaliza el estado recibido a MAYÚSCULAS y lo valida
function normStatus(s) {
  if (!s) return null;
  const x = String(s).trim().toUpperCase();
  const allowed = new Set(["PENDING", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELED"]);
  return allowed.has(x) ? x : null;
}

// Reglas de transición (lado HQ)
const allowedNext = {
  PENDING:     new Set(["ASSIGNED", "CANCELED"]),
  ASSIGNED:    new Set(["IN_PROGRESS", "CANCELED"]),
  IN_PROGRESS: new Set(["DONE", "CANCELED"]),
  DONE:        new Set([]),
  CANCELED:    new Set([]),
};

// Valida (rápido) UUID v4-ish si llega como string (opcional)
function looksLikeUUID(v) {
  if (v === null) return true;            // permitir desasignación
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const { id } = req.query || {};
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

    let {
      status,                  // 'assigned' | 'in_progress' | 'done' | 'canceled'
      vehicle_id = undefined,  // uuid o null (para desasignar)
      driver_name = undefined, // string o null
      notes = undefined        // string o null
    } = req.body || {};

    // Sanitizar strings si vienen
    if (typeof driver_name === "string") driver_name = driver_name.trim() || null;
    if (typeof notes === "string")       notes       = notes.trim() || null;

    // Validar vehicle_id si se pasó (string/null/undefined)
    if (vehicle_id !== undefined) {
      if (vehicle_id !== null && !looksLikeUUID(vehicle_id)) {
        return res.status(400).json({ ok:false, error:"invalid_vehicle_id" });
      }
    }

    // 1) Traer estado actual para validar transición
    const cur = await query(`select status from reservations where id = $1`, [id]);
    if (!cur?.[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const current = String(cur[0].status || "").toUpperCase();

    // 2) Normalizar estado deseado (si viene)
    const next = status ? normStatus(status) : null;
    if (status && !next) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }
    if (next && !allowedNext[current]?.has(next)) {
      return res.status(409).json({
        ok: false,
        error: "invalid_transition",
        detail: `${current} -> ${next} not allowed`
      });
    }

    // 3) Construir UPDATE dinámico
    const sets = [];
    const vals = [];
    let i = 1;

    if (vehicle_id !== undefined) { sets.push(`vehicle_id = $${i++}`); vals.push(vehicle_id); }
    if (driver_name !== undefined){ sets.push(`driver_name = $${i++}`); vals.push(driver_name); }
    if (notes !== undefined)      { sets.push(`notes = $${i++}`);       vals.push(notes); }

    // Estado + timestamps según hitos
    if (next) {
      sets.push(`status = $${i++}`);
      vals.push(next);

      if (next === "ASSIGNED")    sets.push(`assigned_at = now()`);
      if (next === "IN_PROGRESS") sets.push(`started_at  = now()`);
      if (next === "DONE")        sets.push(`done_at     = now()`);
      // Si "CANCELED", no tocamos timestamps previos.
    }

    // Siempre tocar updated_at
    sets.push(`updated_at = now()`);

    if (sets.length === 1) {
      return res.status(400).json({ ok: false, error: "nothing_to_update" });
    }

    const sql = `
      UPDATE reservations
         SET ${sets.join(", ")}
       WHERE id = $${i}
   RETURNING id, status, vehicle_id, driver_name, notes,
             pickup_time, assigned_at, started_at, done_at, updated_at
    `;
    vals.push(id);

    const { rows } = await query(sql, vals);
    if (!rows?.[0]) return res.status(404).json({ ok: false, error: "not_found" });

    return res.json({ ok: true, reservation: rows[0] });
  } catch (e) {
    console.error("[/api/reservations/[id]]", e);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(e?.message || e) });
  }
}

// Protegido para HQ
export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

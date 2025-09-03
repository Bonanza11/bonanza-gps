// /api/admin/vehicles.js
import { pool, query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  const driver_id_raw = (body.driver_id ?? "").toString().trim();
  return {
    id: body.id ? String(body.id) : null,
    plate: (body.plate ?? "").toString().trim(),
    driver_id: driver_id_raw || null,
    driver_name: (body.driver_name ?? "").toString().trim() || null,
    kind: ((body.kind ?? "SUV").toString().trim().toUpperCase() === "VAN") ? "VAN" : "SUV",
    year: body.year != null ? Number(body.year) : null,
    model: (body.model ?? "").toString().trim(),
    active: body.active !== false,
  };
}

/* Busca el nombre del driver si se envía driver_id */
async function resolveDriverName(driver_id) {
  if (!driver_id) return null;
  const { rows } = await pool.query(
    `SELECT name FROM drivers WHERE id::text = $1 LIMIT 1`,
    [String(driver_id)]
  );
  return rows[0]?.name || null;
}

async function handler(req, res) {
  try {
    // ===== GET =====
    if (req.method === "GET") {
      const rows = await query(`
        SELECT
          id::text        AS id,
          plate,
          driver_id::text AS driver_id,
          driver_name,
          kind, year, model, active, created_at
        FROM vehicles
        ORDER BY created_at DESC
        LIMIT 500
      `);
      return res.json({ ok: true, vehicles: rows });
    }

    // ===== POST =====
    if (req.method === "POST") {
      const b = norm(req.body || {});

      if (!b.plate) {
        return res.status(400).json({ ok: false, error: "Missing plate" });
      }

      // Si hay driver_id pero no driver_name, lo busca
      let driver_name_final = b.driver_name;
      if (b.driver_id && !driver_name_final) {
        driver_name_final = await resolveDriverName(b.driver_id);
      }

      // ---- UPDATE ----
      if (b.id) {
        const { rows } = await pool.query(
          `UPDATE vehicles
           SET plate       = $2,
               driver_id   = $3::uuid,
               driver_name = $4,
               kind        = $5,
               year        = $6,
               model       = $7,
               active      = $8,
               updated_at  = now()
           WHERE id::text = $1
           RETURNING id::text AS id, plate, driver_id::text AS driver_id, driver_name, kind, year, model, active, created_at`,
          [b.id, b.plate, b.driver_id, driver_name_final, b.kind, b.year, b.model, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // ---- INSERT ----
      const { rows } = await pool.query(
        `INSERT INTO vehicles (plate, driver_id, driver_name, kind, year, model, active)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
         RETURNING id::text AS id, plate, driver_id::text AS driver_id, driver_name, kind, year, model, active, created_at`,
        [b.plate, b.driver_id, driver_name_final, b.kind, b.year, b.model, b.active]
      );
      return res.json({ ok: true, vehicle: rows[0] });
    }

    // ===== DELETE =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(
        `DELETE FROM vehicles WHERE id::text = $1`,
        [id]
      );
      if (!rowCount) return res.status(404).json({ ok: false, error: "Vehicle not found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/vehicles] error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}

export default requireAuth(["OWNER", "ADMIN", "DISPATCHER"])(handler);

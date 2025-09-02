// /api/admin/vehicles.js
import { pool, query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  return {
    id: body.id ? String(body.id) : null,
    plate: (body.plate ?? "").toString().trim(),
    driver_name: (body.driver_name ?? "").toString().trim(),
    kind: ((body.kind ?? "SUV").toString().trim().toUpperCase() === "VAN") ? "VAN" : "SUV",
    year: body.year != null ? Number(body.year) : null,
    model: (body.model ?? "").toString().trim(),
    active: body.active !== false,
  };
}

async function handler(req, res) {
  try {
    // ===== GET: list =====
    if (req.method === "GET") {
      const rows = await query(`
        select
          id::text as id,
          plate, driver_name, kind, year, model, active, created_at
        from vehicles
        order by created_at desc
        limit 500
      `);
      return res.json({ ok: true, vehicles: rows });
    }

    // ===== POST: create / update =====
    if (req.method === "POST") {
      const b = norm(req.body || {});
      if (!b.plate || !b.driver_name) {
        return res.status(400).json({ ok: false, error: "Missing plate or driver_name" });
      }

      // update por id
      if (b.id) {
        const { rows } = await pool.query(
          `update vehicles
              set plate=$2,
                  driver_name=$3,
                  kind=$4,
                  year=$5,
                  model=$6,
                  active=$7,
                  updated_at=now()
            where id::text=$1
        returning id::text as id, plate, driver_name, kind, year, model, active, created_at`,
          [b.id, b.plate, b.driver_name, b.kind, b.year, b.model, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // crear
      const { rows } = await pool.query(
        `insert into vehicles (plate, driver_name, kind, year, model, active)
         values ($1,$2,$3,$4,$5,$6)
      returning id::text as id, plate, driver_name, kind, year, model, active, created_at`,
        [b.plate, b.driver_name, b.kind, b.year, b.model, b.active]
      );
      return res.json({ ok: true, vehicle: rows[0] });
    }

    // ===== DELETE: by id =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`delete from vehicles where id::text=$1`, [id]);
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

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

// /api/admin/vehicles.js
import { pool } from "../_db.js";

// === Auth helper ===
function checkKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

// === tiny query helper ===
async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

// upsert que intenta 2 estrategias: constraint -> expresión upper(plate)
async function upsertByConstraint({ plate, driver_name, kind, year, model, active }) {
  return q(
    `INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT uniq_vehicles_plate_ci
     DO UPDATE SET
       driver_name = EXCLUDED.driver_name,
       kind        = EXCLUDED.kind,
       year        = EXCLUDED.year,
       model       = EXCLUDED.model,
       active      = EXCLUDED.active
     RETURNING id::text AS id, plate, driver_name, upper(kind) AS kind, year, model, active`,
    [plate, driver_name, kind, Number(year), model || null, !!active]
  );
}

async function upsertByExpression({ plate, driver_name, kind, year, model, active }) {
  return q(
    `INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ((upper(plate)))
     DO UPDATE SET
       driver_name = EXCLUDED.driver_name,
       kind        = EXCLUDED.kind,
       year        = EXCLUDED.year,
       model       = EXCLUDED.model,
       active      = EXCLUDED.active
     RETURNING id::text AS id, plate, driver_name, upper(kind) AS kind, year, model, active`,
    [plate, driver_name, kind, Number(year), model || null, !!active]
  );
}

export default async function handler(req, res) {
  try {
    if (!checkKey(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (req.method === "GET") {
      const rows = await q(
        `SELECT
           id::text AS id,
           plate,
           driver_name,
           upper(kind) AS kind,
           year,
           model,
           active
         FROM vehicles
         ORDER BY kind, plate`
      );
      return res.json({ ok: true, vehicles: rows });
    }

    if (req.method === "POST") {
      const { id, plate, driver_name } = req.body || {};
      const kind  = String(req.body?.kind || "").toUpperCase().trim();
      const year  = Number(req.body?.year || 0);
      const model = (req.body?.model || "").trim();
      const active= !!req.body?.active;

      if (!plate || !driver_name || !kind || !year) {
        return res.status(400).json({ ok: false, error: "Missing fields" });
      }
      if (kind !== "SUV" && kind !== "VAN") {
        return res.status(400).json({ ok: false, error: "kind must be SUV or VAN" });
      }

      // UPDATE por id (id puede ser uuid o texto)
      if (id) {
        const rows = await q(
          `UPDATE vehicles
             SET plate = $2,
                 driver_name = $3,
                 kind = $4,
                 year = $5,
                 model = $6,
                 active = $7
           WHERE id::text = $1
           RETURNING id::text AS id, plate, driver_name, upper(kind) AS kind, year, model, active`,
          [String(id), plate.trim(), driver_name.trim(), kind, year, model || null, active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // INSERT con UPSERT por placa (case-insensitive)
      try {
        const rows = await upsertByConstraint({
          plate: plate.trim(), driver_name: driver_name.trim(), kind, year, model, active
        });
        return res.json({ ok: true, vehicle: rows[0] });
      } catch (e) {
        // si el constraint no existe, reintenta con expresión
        const msg = (e && e.message) || "";
        const looksLikeNoConstraint =
          /constraint .* does not exist/i.test(msg) || /undefined_table/i.test(msg);
        if (!looksLikeNoConstraint) throw e;

        const rows2 = await upsertByExpression({
          plate: plate.trim(), driver_name: driver_name.trim(), kind, year, model, active
        });
        return res.json({ ok: true, vehicle: rows2[0] });
      }
    }

    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      const rows = await q(`DELETE FROM vehicles WHERE id::text = $1 RETURNING id`, [id]);
      if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/vehicles] error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}

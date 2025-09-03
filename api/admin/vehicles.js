// /api/admin/vehicles.js
import { pool, query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  const kindIn = (body.kind ?? "SUV").toString().trim().toUpperCase();
  const kind   = kindIn === "VAN" ? "VAN" : "SUV";

  return {
    id          : body.id ? String(body.id) : null,
    plate       : (body.plate ?? "").toString().trim(),
    // NUEVO: manejo del enlace con drivers
    driver_id   : body.driver_id ? String(body.driver_id) : null,
    // Legacy opcional (solo si NO hay driver_id)
    driver_name : (body.driver_name ?? "").toString().trim() || null,
    kind,
    year        : body.year != null ? Number(body.year) : null,
    model       : (body.model ?? "").toString().trim() || null,
    active      : body.active !== false,
  };
}

function validate(v){
  if (!v.plate) return "Missing plate";
  if (v.year && (v.year < 1990 || v.year > 2099)) return "Invalid year";
  if (!["SUV","VAN"].includes(v.kind)) return "Invalid kind";
  return null;
}

/* ---------- Mapea fila DB -> objeto UI ---------- */
function rowToUi(r){
  return {
    id          : String(r.id),
    plate       : r.plate,
    kind        : r.kind === "VAN" ? "VAN" : "SUV",
    year        : r.year,
    model       : r.model,
    active      : r.active,
    driver_id   : r.driver_id ? String(r.driver_id) : null,
    driver_name : r.driver_name || "",
    created_at  : r.created_at,
  };
}

async function handler(req, res) {
  try {
    /* ===== GET: list (con JOIN a drivers) ===== */
    if (req.method === "GET") {
      const rows = await query(`
        SELECT
          v.id::text AS id,
          v.plate,
          v.kind,
          v.year,
          v.model,
          v.active,
          v.driver_id::text AS driver_id,
          COALESCE(d.name, v.driver_name) AS driver_name,
          v.created_at
        FROM vehicles v
        LEFT JOIN drivers d ON d.id = v.driver_id
        ORDER BY v.created_at DESC
        LIMIT 500
      `);
      return res.json({ ok: true, vehicles: rows.map(rowToUi) });
    }

    /* ===== POST: create / update (acepta driver_id y opcional driver_name) ===== */
    if (req.method === "POST") {
      const b = norm(req.body || {});
      const err = validate(b);
      if (err) return res.status(400).json({ ok:false, error: err });

      // UPDATE
      if (b.id) {
        const { rows } = await pool.query(
          `
          UPDATE vehicles
             SET plate=$2,
                 kind=$3,
                 year=$4,
                 model=$5,
                 active=$6,
                 driver_id=$7,
                 -- si hay driver_id usamos ese enlace y anulamos driver_name texto
                 driver_name = CASE WHEN $7 IS NULL THEN $8 ELSE NULL END,
                 updated_at = now()
           WHERE id::text = $1
       RETURNING
         id::text AS id,
         plate, kind, year, model, active,
         driver_id::text AS driver_id,
         (SELECT COALESCE(d.name, vehicles.driver_name)
            FROM drivers d WHERE d.id = vehicles.driver_id) AS driver_name,
         created_at
          `,
          [b.id, b.plate, b.kind, b.year, b.model, b.active, b.driver_id, b.driver_name]
        );
        if (!rows.length) return res.status(404).json({ ok:false, error:"Vehicle not found" });
        return res.json({ ok:true, vehicle: rowToUi(rows[0]) });
      }

      // INSERT
      const { rows } = await pool.query(
        `
        INSERT INTO vehicles
          (plate, kind, year, model, active, driver_id, driver_name)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7)
        RETURNING
          id::text AS id,
          plate, kind, year, model, active,
          driver_id::text AS driver_id,
          (SELECT COALESCE(d.name, vehicles.driver_name)
             FROM drivers d WHERE d.id = vehicles.driver_id) AS driver_name,
          created_at
        `,
        [b.plate, b.kind, b.year, b.model, b.active, b.driver_id, b.driver_name]
      );
      return res.json({ ok:true, vehicle: rowToUi(rows[0]) });
    }

    /* ===== DELETE: by id ===== */
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok:false, error:"Missing id" });
      const { rowCount } = await pool.query(`DELETE FROM vehicles WHERE id::text=$1`, [id]);
      if (!rowCount) return res.status(404).json({ ok:false, error:"Vehicle not found" });
      return res.json({ ok:true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok:false, error:"Method Not Allowed" });

  } catch (e) {
    // 23503: foreign_key_violation (driver_id inexistente)
    if (e && e.code === "23503") {
      return res.status(400).json({ ok:false, error:"Invalid driver_id (FK violation)" });
    }
    console.error("[/api/admin/vehicles] error:", e);
    return res.status(500).json({ ok:false, error: e.message || "Internal error" });
  }
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

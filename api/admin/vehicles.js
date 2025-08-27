// /api/admin/vehicles.js
import { pool } from "../_db.js";

/* ---------- Auth ---------- */
function checkKey(req) {
  // En Node/Vercel, los headers van en minúsculas
  const hdr = req.headers["x-admin-key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";

  // Logs de depuración (enmascarados)
  try {
    const mask = (s) => (s ? String(s).replace(/.(?=.{4})/g, "•") : "");
    console.log("[vehicles] x-admin-key:", mask(hdr));
    console.log("[vehicles] ADMIN_KEY :", mask(envKey));
  } catch {}

  return hdr && String(hdr) === String(envKey);
}

/* ---------- Helper SQL ---------- */
async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export default async function handler(req, res) {
  try {
    /* --- Auth --- */
    if (!checkKey(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    /* --- GET: listar --- */
    if (req.method === "GET") {
      const rows = await q(
        `SELECT
           id::text  AS id,
           plate,
           driver_name,
           UPPER(kind) AS kind,
           year,
           model,
           active
         FROM vehicles
         ORDER BY kind, plate`
      );
      return res.json({ ok: true, vehicles: rows });
    }

    /* --- POST: crear/editar --- */
    if (req.method === "POST") {
      const { id, plate, driver_name, kind, year, model, active } = req.body || {};

      const k = String(kind || "").toUpperCase();
      if (!plate || !driver_name || !k || !year) {
        return res.status(400).json({ ok: false, error: "Missing fields" });
      }
      if (k !== "SUV" && k !== "VAN") {
        return res.status(400).json({ ok: false, error: "kind must be SUV or VAN" });
      }

      // Si viene id => UPDATE por id (id puede ser uuid; comparamos como texto)
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
           RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active`,
          [String(id), plate, driver_name, k, Number(year), model || null, !!active]
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "Vehicle not found" });
        }
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // Sin id => UPSERT por placa *case-insensitive* SIN constraint
      // 1) intentamos UPDATE por upper(plate)
      const upd = await q(
        `UPDATE vehicles
            SET plate = $1,
                driver_name = $2,
                kind = $3,
                year = $4,
                model = $5,
                active = $6
          WHERE UPPER(plate) = UPPER($1)
          RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active`,
        [plate, driver_name, k, Number(year), model || null, !!active]
      );
      if (upd.length) {
        return res.json({ ok: true, vehicle: upd[0] });
      }

      // 2) si no existía, INSERT
      const ins = await q(
        `INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active`,
        [plate, driver_name, k, Number(year), model || null, !!active]
      );
      return res.json({ ok: true, vehicle: ins[0] });
    }

    /* --- DELETE: borrar por id --- */
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      const rows = await q(`DELETE FROM vehicles WHERE id::text = $1 RETURNING id`, [id]);
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Vehicle not found" });
      }
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/vehicles] error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}

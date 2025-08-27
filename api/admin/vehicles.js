// /api/admin/vehicles.js
// CRUD de vehículos para el panel. Compatible con id TEXT o UUID.
// Requiere header: x-admin-key = process.env.ADMIN_KEY (o "supersecreto123" como fallback)

import { pool } from "../_db.js";

const EXPECTED_KEY = process.env.ADMIN_KEY || "supersecreto123";

// ────────────────────────────────────────────────────────────────────────────────
// Utils
function bad(res, code, msg) {
  res.status(code).json({ ok: false, error: msg });
}
function asBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  if (typeof v === "number") return v !== 0;
  return false;
}
function normKind(k) {
  k = (k || "").toString().trim().toUpperCase();
  return k === "VAN" ? "VAN" : "SUV";
}
function toInt(n) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : null;
}
async function nextId(kind) {
  // Calcula el siguiente id tipo "SUV-011" o "VAN-006" leyendo el sufijo numérico mayor
  const k = normKind(kind);
  const sql = `
    SELECT COALESCE(MAX( (REGEXP_MATCH(id::text, '\\d+$'))[1]::int ), 0) AS maxn
    FROM vehicles
    WHERE UPPER(kind) = $1
  `;
  const { rows } = await pool.query(sql, [k]);
  const n = (rows?.[0]?.maxn || 0) + 1;
  return `${k}-${String(n).padStart(3, "0")}`;
}

function requireAuth(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== EXPECTED_KEY) {
    bad(res, 401, "Unauthorized");
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────────
// Handler
export default async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method === "GET") {
      // Listado
      const q = `
        SELECT 
          id::text AS id,
          plate,
          driver_name,
          UPPER(kind) AS kind,
          year,
          model,
          active
        FROM vehicles
        ORDER BY kind, id::text
      `;
      const { rows } = await pool.query(q);
      res.json({ ok: true, vehicles: rows });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

      // Si es toggle (solo id + active)
      if (body && body.id && typeof body.active !== "undefined" && !body.plate && !body.driver_name && !body.kind) {
        const id = String(body.id);
        const active = asBool(body.active);
        const q = `
          UPDATE vehicles 
          SET active = $2 
          WHERE id::text = $1
          RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active
        `;
        const { rows } = await pool.query(q, [id, active]);
        if (!rows.length) return bad(res, 404, "Not found");
        res.json({ ok: true, vehicle: rows[0] });
        return;
      }

      // Upsert completo (crear o editar)
      let {
        id,
        plate,
        driver_name,
        kind,
        year,
        model,
        active,
      } = body;

      plate = (plate || "").trim();
      driver_name = (driver_name || "").trim();
      kind = normKind(kind);
      year = toInt(year);
      model = (model || "").trim();
      active = asBool(active);

      if (!plate || !driver_name || !year) {
        return bad(res, 400, "Missing required fields (plate, driver_name, year).");
      }
      if (!id) id = await nextId(kind);

      const q = `
        INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          plate       = EXCLUDED.plate,
          driver_name = EXCLUDED.driver_name,
          kind        = EXCLUDED.kind,
          year        = EXCLUDED.year,
          model       = EXCLUDED.model,
          active      = EXCLUDED.active
        RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active
      `;
      const params = [id, plate, driver_name, kind, year, model, active];
      const { rows } = await pool.query(q, params);
      res.json({ ok: true, vehicle: rows[0] });
      return;
    }

    if (req.method === "DELETE") {
      const id = (req.query?.id || req.query?.ID || "").toString();
      if (!id) return bad(res, 400, "Missing id");
      const q = `DELETE FROM vehicles WHERE id::text = $1 RETURNING id::text AS id`;
      const { rows } = await pool.query(q, [id]);
      if (!rows.length) return bad(res, 404, "Not found");
      res.json({ ok: true, id: rows[0].id });
      return;
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return bad(res, 405, "Method Not Allowed");
  } catch (err) {
    console.error("[/api/admin/vehicles] error:", err);
    return bad(res, 500, err?.message || "Internal error");
  }
}

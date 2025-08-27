// /api/admin/vehicles.js
import { pool } from "../_db.js";

const EXPECTED_KEY = process.env.ADMIN_KEY || "supersecreto123";

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
function requireAuth(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== EXPECTED_KEY) {
    bad(res, 401, "Unauthorized");
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method === "GET") {
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
        ORDER BY kind, plate
      `;
      const { rows } = await pool.query(q);
      res.json({ ok: true, vehicles: rows });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

      // toggle (solo id+active)
      if (body.id && typeof body.active !== "undefined" && !body.plate) {
        const q = `
          UPDATE vehicles 
          SET active = $2
          WHERE id = $1::uuid
          RETURNING id::text AS id, plate, driver_name, kind, year, model, active
        `;
        const { rows } = await pool.query(q, [body.id, asBool(body.active)]);
        if (!rows.length) return bad(res, 404, "Not found");
        res.json({ ok: true, vehicle: rows[0] });
        return;
      }

      // Insertar nuevo (dejamos que Postgres genere id)
      let { id, plate, driver_name, kind, year, model, active } = body;
      plate = (plate || "").trim();
      driver_name = (driver_name || "").trim();
      kind = normKind(kind);
      year = toInt(year);
      model = (model || "").trim();
      active = asBool(active);

      if (!plate || !driver_name || !year) {
        return bad(res, 400, "Missing required fields");
      }

      let q, params;
      if (!id) {
        q = `
          INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING id::text AS id, plate, driver_name, kind, year, model, active
        `;
        params = [plate, driver_name, kind, year, model, active];
      } else {
        q = `
          UPDATE vehicles
          SET plate=$2, driver_name=$3, kind=$4, year=$5, model=$6, active=$7
          WHERE id=$1::uuid
          RETURNING id::text AS id, plate, driver_name, kind, year, model, active
        `;
        params = [id, plate, driver_name, kind, year, model, active];
      }

      const { rows } = await pool.query(q, params);
      res.json({ ok: true, vehicle: rows[0] });
      return;
    }

    if (req.method === "DELETE") {
      const id = (req.query?.id || "").toString();
      if (!id) return bad(res, 400, "Missing id");
      const q = `DELETE FROM vehicles WHERE id=$1::uuid RETURNING id::text AS id`;
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

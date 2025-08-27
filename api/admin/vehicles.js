// /api/admin/vehicles.js
import { pool, query } from "../_db.js";

// --- Auth ---
function checkKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

// Normaliza y valida fields
function norm(body) {
  const v = {
    id: body?.id ? String(body.id) : null,
    plate: (body?.plate ?? "").toString().trim(),
    driver_name: (body?.driver_name ?? "").toString().trim(),
    kind: (body?.kind ?? "").toString().trim().toUpperCase(),
    year: body?.year != null ? Number(body.year) : null,
    model: (body?.model ?? "").toString().trim() || null,
    active: !!body?.active,
  };
  if (v.kind !== "SUV" && v.kind !== "VAN") v.kind = "SUV";
  return v;
}

// Leer registro formateado
const SELECT_ONE =
  `select id::text as id, plate, driver_name,
          upper(kind) as kind, year, model, active
   from vehicles where id = $1`;

export default async function handler(req, res) {
  try {
    if (!checkKey(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (req.method === "GET") {
      const rows = await query(
        `select id::text as id, plate, driver_name,
                upper(kind) as kind, year, model, active
         from vehicles
         order by kind, plate`
      );
      return res.json({ ok: true, vehicles: rows });
    }

    if (req.method === "POST") {
      const b = norm(req.body || {});

      // 1) Toggle rápido: {id, active} y NADA más
      const onlyToggle =
        b.id &&
        Object.keys(req.body || {}).every(k => k === "id" || k === "active");

      if (onlyToggle) {
        const { rows } = await pool.query(
          `update vehicles set active = $2 where id::text = $1
           returning id::text as id, plate, driver_name, upper(kind) as kind, year, model, active`,
          [b.id, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // 2) Edición completa por id
      if (b.id) {
        if (!b.plate || !b.driver_name || !b.year)
          return res.status(400).json({ ok: false, error: "Missing fields" });

        const { rows } = await pool.query(
          `update vehicles
             set plate = $2, driver_name = $3, kind = $4,
                 year = $5, model = $6, active = $7
           where id::text = $1
           returning id::text as id, plate, driver_name, upper(kind) as kind, year, model, active`,
          [b.id, b.plate, b.driver_name, b.kind, b.year, b.model, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Vehicle not found" });
        return res.json({ ok: true, vehicle: rows[0] });
      }

      // 3) Crear / UPSERT manual por placa (case-insensitive)
      if (!b.plate || !b.driver_name || !b.year)
        return res.status(400).json({ ok: false, error: "Missing fields" });

      // Buscar por UPPER(plate)
      const found = await query(
        `select id from vehicles where upper(plate) = upper($1) limit 1`,
        [b.plate]
      );

      if (found.length) {
        const id = found[0].id;
        const { rows } = await pool.query(
          `update vehicles
             set driver_name = $2, kind = $3, year = $4, model = $5, active = $6
           where id = $1
           returning id::text as id, plate, driver_name, upper(kind) as kind, year, model, active`,
          [id, b.driver_name, b.kind, b.year, b.model, b.active]
        );
        return res.json({ ok: true, vehicle: rows[0] });
      } else {
        const { rows } = await pool.query(
          `insert into vehicles (plate, driver_name, kind, year, model, active)
           values ($1,$2,$3,$4,$5,$6)
           returning id::text as id, plate, driver_name, upper(kind) as kind, year, model, active`,
          [b.plate, b.driver_name, b.kind, b.year, b.model, b.active]
        );
        return res.json({ ok: true, vehicle: rows[0] });
      }
    }

    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`delete from vehicles where id::text = $1`, [id]);
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

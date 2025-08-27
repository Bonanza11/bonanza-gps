// api/admin/vehicles.js
// CRUD de vehículos (SUV/VAN) con autorización por ADMIN_KEY

import { query } from "../_db.js"; // <- tu helper de DB (ESM)

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function getAdminKey(req) {
  // prioridad: header, luego query ?key=
  return (
    req.headers["x-admin-key"] ||
    new URL(req.url, `http://${req.headers.host}`).searchParams.get("key") ||
    ""
  );
}

function normalizeVehicle(input = {}) {
  // Sanitiza y normaliza campos
  const v = { ...input };
  v.id = (v.id || "").trim();
  v.plate = (v.plate || "").trim();
  v.driver_name = (v.driver_name || "").trim();
  v.kind = (v.kind || "").trim().toUpperCase(); // "SUV" | "VAN"
  v.year = v.year == null || v.year === "" ? null : Number(v.year);
  v.model = (v.model || "").trim();
  v.active = !!v.active;
  if (v.kind !== "SUV" && v.kind !== "VAN") v.kind = "SUV";
  return v;
}

// Genera un ID incremental con prefijo (SUV-### o VAN-###)
async function generateId(kind) {
  const pref = kind === "VAN" ? "VAN" : "SUV";
  // Extrae el mayor sufijo numérico existente para ese prefijo
  const rows = await query(
    `SELECT id
       FROM vehicles
      WHERE id ILIKE $1
   ORDER BY
      CAST(regexp_replace(id, '^[^0-9]*', '') AS INT) DESC
      NULLS LAST
      LIMIT 1`,
    [`${pref}-%`]
  );

  let next = 1;
  if (rows.length) {
    const last = rows[0].id;
    const n = Number(String(last).replace(/^\D+/, "")) || 0;
    next = n + 1;
  }
  return `${pref}-${String(next).padStart(3, "0")}`;
}

// ====== Handler principal ======
export default async function handler(req, res) {
  try {
    // --- Auth ---
    const provided = String(getAdminKey(req) || "");
    const expected = String(process.env.ADMIN_KEY || "");
    if (!expected) {
      return json(res, 500, { ok: false, error: "ADMIN_KEY not configured" });
    }
    if (provided !== expected) {
      return json(res, 401, { ok: false, error: "Unauthorized" });
    }

    // --- Métodos ---
    if (req.method === "GET") {
      const rows = await query(
        `SELECT id, plate, driver_name, UPPER(kind) AS kind, year, model, active
           FROM vehicles
       ORDER BY id ASC`
      );
      return json(res, 200, { ok: true, vehicles: rows || [] });
    }

    if (req.method === "POST") {
      let body = {};
      try {
        body = typeof req.body === "object" && req.body
          ? req.body
          : JSON.parse(req.body || "{}");
      } catch {
        return json(res, 400, { ok: false, error: "Invalid JSON body" });
      }

      const v = normalizeVehicle(body);

      // Si no viene id => crear
      if (!v.id) v.id = await generateId(v.kind);

      // Validaciones mínimas
      if (!v.plate) return json(res, 400, { ok: false, error: "plate required" });
      if (!v.driver_name) v.driver_name = "Driver";
      if (v.year !== null && (isNaN(v.year) || v.year < 1990 || v.year > 2100)) {
        return json(res, 400, { ok: false, error: "year invalid" });
      }

      // UPSERT por id
      const rows = await query(
        `INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id)
           DO UPDATE SET
             plate       = EXCLUDED.plate,
             driver_name = EXCLUDED.driver_name,
             kind        = EXCLUDED.kind,
             year        = EXCLUDED.year,
             model       = EXCLUDED.model,
             active      = EXCLUDED.active
         RETURNING id, plate, driver_name, UPPER(kind) AS kind, year, model, active`,
        [v.id, v.plate, v.driver_name, v.kind, v.year, v.model, v.active]
      );

      return json(res, 200, { ok: true, vehicle: rows[0] });
    }

    if (req.method === "DELETE") {
      // id por query o body
      const url = new URL(req.url, `http://${req.headers.host}`);
      let id = url.searchParams.get("id");
      if (!id) {
        try {
          const body = typeof req.body === "object" && req.body
            ? req.body
            : JSON.parse(req.body || "{}");
          id = body.id;
        } catch {}
      }
      id = (id || "").trim();
      if (!id) return json(res, 400, { ok: false, error: "id required" });

      const rows = await query(`DELETE FROM vehicles WHERE id = $1 RETURNING id`, [id]);
      if (!rows.length) return json(res, 404, { ok: false, error: "Not found" });

      return json(res, 200, { ok: true, deleted: rows[0].id });
    }

    // Método no permitido
    res.setHeader("Allow", "GET,POST,DELETE");
    return json(res, 405, { ok: false, error: "Method Not Allowed" });
  } catch (err) {
    console.error("[/api/admin/vehicles] error:", err);
    return json(res, 500, { ok: false, error: "Internal error" });
  }
}

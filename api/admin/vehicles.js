// /api/admin/vehicles.js
import { query } from "../_db.js";

/** --- Helpers --- */
const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

function json(res, code, obj) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function normKind(k) {
  // ⚠️ Guardamos en la BD SIEMPRE en minúsculas para no violar el CHECK
  k = (k || "").toString().trim().toLowerCase();
  return k === "van" ? "van" : "suv";
}

function normPlate(p) {
  return (p || "").toString().trim().toUpperCase();
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = (v || "").toString().trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function rowOut(r) {
  // Devolvemos kind tal cual viene (minúsculas). El front lo puede mostrar en mayúsculas.
  return {
    id: r.id?.toString?.() ?? r.id,
    plate: r.plate,
    driver_name: r.driver_name,
    kind: r.kind,
    year: r.year,
    model: r.model,
    active: !!r.active,
  };
}

/** --- Auth --- */
function checkKey(req) {
  const k = req.headers["x-admin-key"] || req.query?.key || req.cookies?.key;
  return k === ADMIN;
}

/** --- Handler --- */
export default async function handler(req, res) {
  try {
    // CORS básico (opcional)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      return res.status(204).end();
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!checkKey(req)) {
      return json(res, 401, { ok: false, error: "Unauthorized" });
    }

    if (req.method === "GET") {
      // Lista
      const rows = await query(
        `SELECT id, plate, driver_name, kind, year, model, active
           FROM vehicles
          ORDER BY kind, plate`
      );
      return json(res, 200, { ok: true, vehicles: rows.map(rowOut) });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      // Si viene sólo toggle de "active"
      if (
        (body.id || body.plate) &&
        typeof body.active !== "undefined" &&
        !body.plate?.trim?.() // no intentar cambiar placa en este modo
      ) {
        const idStr = body.id ? String(body.id) : null;
        const plate = body.plate ? normPlate(body.plate) : null;

        let updated = [];
        if (idStr) {
          updated = await query(
            `UPDATE vehicles
                SET active = $2
              WHERE id::text = $1
          RETURNING id, plate, driver_name, kind, year, model, active`,
            [idStr, toBool(body.active)]
          );
        }
        // Si no encontró por id y tenemos plate, intenta por plate (case-insensitive)
        if (!updated.length && plate) {
          updated = await query(
            `UPDATE vehicles
                SET active = $2
              WHERE upper(plate) = upper($1)
          RETURNING id, plate, driver_name, kind, year, model, active`,
            [plate, toBool(body.active)]
          );
        }
        if (!updated.length)
          return json(res, 404, { ok: false, error: "Vehicle not found" });

        return json(res, 200, { ok: true, vehicle: rowOut(updated[0]) });
      }

      // Upsert (crear/editar)
      const plate = normPlate(body.plate);
      const driver = (body.driver_name || "").toString().trim();
      const kind = normKind(body.kind);
      const year =
        body.year == null || body.year === ""
          ? null
          : parseInt(String(body.year), 10);
      const model = (body.model || "").toString().trim();
      const active = toBool(body.active);

      if (!plate || !driver) {
        return json(res, 400, {
          ok: false,
          error: "Missing required fields: plate, driver_name",
        });
      }

      // Si mandan id y tu columna es UUID, casteamos a text para comparar.
      const idStr = body.id ? String(body.id) : null;

      // Usamos plate como conflicto (deberías tener UNIQUE por plate o por upper(plate)).
      // Si existe constraint case-insensitive (por ejemplo uniq_vehicles_plate_ci),
      // también puedes usar: ON CONFLICT ON CONSTRAINT uniq_vehicles_plate_ci
      const upsertSql = `
        INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
        VALUES (
          COALESCE(
            $1::text,
            (SELECT id::text FROM vehicles WHERE upper(plate)=upper($2))::text,
            gen_random_uuid()::text
          )::uuid,
          $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (plate)
        DO UPDATE SET
          plate = EXCLUDED.plate,
          driver_name = EXCLUDED.driver_name,
          kind = EXCLUDED.kind,
          year = EXCLUDED.year,
          model = EXCLUDED.model,
          active = EXCLUDED.active
        RETURNING id, plate, driver_name, kind, year, model, active
      `;

      // Nota: si tu columna id es TEXT (no UUID), cambia ::uuid por ::text en la línea anterior.
      // Si no sabes cuál tienes, aquí va una versión que funciona en ambos escenarios: intentamos UUID,
      // y si falla por tipo, reintentamos como TEXT.

      try {
        const rows = await query(upsertSql, [
          idStr,
          plate,
          driver,
          kind,
          year,
          model,
          active,
        ]);
        return json(res, 200, { ok: true, vehicle: rowOut(rows[0]) });
      } catch (e) {
        // Reintento para esquemas con id TEXT (sin UUID)
        const upsertTextId = `
          INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
          VALUES (
            COALESCE(
              $1::text,
              (SELECT id::text FROM vehicles WHERE upper(plate)=upper($2))::text,
              concat(upper($4), '-', lpad((floor(random()*900)+100)::text, 3, '0'))
            ),
            $2, $3, $4, $5, $6, $7
          )
          ON CONFLICT (plate)
          DO UPDATE SET
            plate = EXCLUDED.plate,
            driver_name = EXCLUDED.driver_name,
            kind = EXCLUDED.kind,
            year = EXCLUDED.year,
            model = EXCLUDED.model,
            active = EXCLUDED.active
          RETURNING id, plate, driver_name, kind, year, model, active
        `;
        const rows = await query(upsertTextId, [
          idStr,
          plate,
          driver,
          kind,
          year,
          model,
          active,
        ]);
        return json(res, 200, { ok: true, vehicle: rowOut(rows[0]) });
      }
    }

    if (req.method === "DELETE") {
      const id = (req.query?.id || "").toString();
      const plate = (req.query?.plate || "").toString();

      if (!id && !plate) {
        return json(res, 400, { ok: false, error: "Missing id or plate" });
      }

      let del = [];
      if (id) {
        del = await query(
          `DELETE FROM vehicles WHERE id::text = $1
            RETURNING id, plate, driver_name, kind, year, model, active`,
          [id]
        );
      }
      if (!del.length && plate) {
        del = await query(
          `DELETE FROM vehicles WHERE upper(plate) = upper($1)
            RETURNING id, plate, driver_name, kind, year, model, active`,
          [plate]
        );
      }
      if (!del.length)
        return json(res, 404, { ok: false, error: "Vehicle not found" });

      return json(res, 200, { ok: true, deleted: rowOut(del[0]) });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/admin/vehicles] error:", err);
    return json(res, 500, { ok: false, error: "Internal error" });
  }
}

// /api/admin/vehicles.js
import { query } from "../_db.js";

const OK = (res, data = {}) => res.status(200).json({ ok: true, ...data });
const ERR = (res, code = 400, msg = "Bad request") =>
  res.status(code).json({ ok: false, error: msg });

export default async function handler(req, res) {
  // 🔐 Seguridad con ADMIN_KEY (Vercel env)
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!key || key !== process.env.ADMIN_KEY) {
    return ERR(res, 401, "Unauthorized");
  }

  try {
    if (req.method === "GET") {
      // Lista todos los vehículos
      const rows = await query(
        `SELECT id, plate, driver_name, kind, year, model, active
           FROM vehicles
         ORDER BY kind, plate`
      );
      return OK(res, { vehicles: rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const op = (body?.op || "").toLowerCase();

      // Cambiar estado activo/inactivo
      if (op === "toggle") {
        const { id, active } = body;
        if (!id || typeof active !== "boolean") {
          return ERR(res, 400, "Missing id/active");
        }
        await query(`UPDATE vehicles SET active = $2 WHERE id = $1`, [id, active]);
        return OK(res, { id, active });
      }

      // Crear/editar (upsert)
      if (op === "upsert") {
        const { id, plate, driver_name, kind, year, model, active } = body;

        if (!id || !plate || !driver_name || !kind) {
          return ERR(res, 400, "Missing required fields (id, plate, driver_name, kind)");
        }
        const yr = year ? Number(year) : null;
        const act = !!active;

        await query(
          `
          INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
          VALUES ($1, $2, $3, UPPER($4), $5, $6, $7)
          ON CONFLICT (id) DO UPDATE
             SET plate = EXCLUDED.plate,
                 driver_name = EXCLUDED.driver_name,
                 kind = EXCLUDED.kind,
                 year = EXCLUDED.year,
                 model = EXCLUDED.model,
                 active = EXCLUDED.active
          `,
          [id, plate, driver_name, kind, yr, model || null, act]
        );
        return OK(res, { id });
      }

      // Borrar
      if (op === "delete") {
        const { id } = body;
        if (!id) return ERR(res, 400, "Missing id");
        await query(`DELETE FROM vehicles WHERE id = $1`, [id]);
        return OK(res, { id });
      }

      return ERR(res, 400, "Unknown op (use 'get', 'toggle', 'upsert', 'delete')");
    }

    // Opcional: soportar DELETE directo
    if (req.method === "DELETE") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { id } = body || {};
      if (!id) return ERR(res, 400, "Missing id");
      await query(`DELETE FROM vehicles WHERE id = $1`, [id]);
      return OK(res, { id });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return ERR(res, 405, "Method Not Allowed");
  } catch (err) {
    console.error("[/api/admin/vehicles] error:", err);
    return ERR(res, 500, err.message || "Server error");
  }
}

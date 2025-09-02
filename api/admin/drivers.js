// /api/admin/drivers.js
import { pool, query } from "../_db.js";

// --- Auth ---
function checkKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

// Normaliza body
function norm(body = {}) {
  return {
    id: body.id ? String(body.id) : null,
    name: (body.name ?? "").toString().trim(),
    phone: (body.phone ?? "").toString().trim() || null,
    email: (body.email ?? "").toString().trim().toLowerCase() || null,
    license_number: (body.license_number ?? "").toString().trim() || null,
    work_mode: (body.work_mode ?? "24h").toString().trim().toLowerCase(), // 24h o custom
    active: body.active !== false,
  };
}

/**
 * GET    -> lista de choferes
 * POST   -> crea o actualiza
 * DELETE -> elimina por id
 */
export default async function handler(req, res) {
  try {
    if (!checkKey(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

    // ===== GET =====
    if (req.method === "GET") {
      const rows = await query(
        `select
           id::text as id, name, phone, email,
           license_number, work_mode, active, created_at
         from drivers
         order by created_at desc
         limit 500`
      );
      return res.json({ ok: true, drivers: rows });
    }

    // ===== POST =====
    if (req.method === "POST") {
      const b = norm(req.body || {});
      if (!b.name) return res.status(400).json({ ok: false, error: "Missing name" });

      // update por id
      if (b.id) {
        const { rows } = await pool.query(
          `update drivers
              set name=$2,
                  phone=$3,
                  email=$4,
                  license_number=$5,
                  work_mode=$6,
                  active=$7,
                  updated_at=now()
            where id::text=$1
            returning id::text as id, name, phone, email, license_number, work_mode, active, created_at`,
          [b.id, b.name, b.phone, b.email, b.license_number, b.work_mode, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Driver not found" });
        return res.json({ ok: true, driver: rows[0] });
      }

      // crear
      const { rows } = await pool.query(
        `insert into drivers (name, phone, email, license_number, work_mode, active)
         values ($1,$2,$3,$4,$5,$6)
         returning id::text as id, name, phone, email, license_number, work_mode, active, created_at`,
        [b.name, b.phone, b.email, b.license_number, b.work_mode, b.active]
      );
      return res.json({ ok: true, driver: rows[0] });
    }

    // ===== DELETE =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`delete from drivers where id::text = $1`, [id]);
      if (!rowCount) return res.status(404).json({ ok: false, error: "Driver not found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/drivers] error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}

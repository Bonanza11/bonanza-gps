// /api/admin/drivers.js
import { pool, query } from "../_db.js";

export const config = { runtime: "nodejs" };

/* ---------- Auth con ADMIN_KEY ---------- */
function checkKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

/* ---------- Validaciones ---------- */
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isPhone(v) { return /^[0-9\-\+\s\(\)]{7,20}$/.test(v); }
const ALLOWED = new Set(["per_ride","hourly","per_load"]); // <- minúscula para DB

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  const email = ((body.email ?? "").toString().trim() || null)?.toLowerCase() || null;
  const phone = (body.phone ?? "").toString().trim() || null;

  // Acepta cualquier casing de entrada, pero guarda en DB en minúscula
  const pay_mode_in  = (body.pay_mode ?? "PER_RIDE").toString().trim();
  const pay_mode_db  = pay_mode_in.toLowerCase();     // lo que va a la DB (pasa el CHECK)
  const pay_mode_ui  = pay_mode_db.toUpperCase();     // lo que devolvemos al frontend

  return {
    id: body.id ? String(body.id) : null,
    name: (body.name ?? "").toString().trim(),
    phone,
    email,
    license_number: (body.license_number ?? "").toString().trim() || null,
    work_mode: (body.work_mode ?? "24h").toString().trim().toLowerCase(), // "24h" | "custom"
    pay_mode_db,  // minúscula
    pay_mode_ui,  // mayúscula para respuesta
    active: body.active !== false, // por defecto true
  };
}

/* ---------- Mapea fila DB -> objeto para UI ---------- */
function rowToUi(r){
  return {
    id: String(r.id),
    name: r.name,
    phone: r.phone,
    email: r.email,
    license_number: r.license_number,
    work_mode: r.work_mode,
    pay_mode: String(r.pay_mode || "per_ride").toUpperCase(), // UI siempre en MAYÚSCULA
    active: r.active,
    created_at: r.created_at
  };
}

export default async function handler(req, res) {
  try {
    if (!checkKey(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    /* ---------- GET: lista ---------- */
    if (req.method === "GET") {
      const rows = await query(`
        SELECT
          id::text AS id, name, phone, email,
          license_number, work_mode, pay_mode, active, created_at
        FROM drivers
        ORDER BY created_at DESC
        LIMIT 500
      `);
      return res.json({ ok: true, drivers: rows.map(rowToUi) });
    }

    /* ---------- POST: create / update ---------- */
    if (req.method === "POST") {
      const b = norm(req.body || {});
      if (!b.name)                 return res.status(400).json({ ok:false, error:"Missing name" });
      if (b.email && !isEmail(b.email)) return res.status(400).json({ ok:false, error:"Invalid email" });
      if (b.phone && !isPhone(b.phone)) return res.status(400).json({ ok:false, error:"Invalid phone" });
      if (!ALLOWED.has(b.pay_mode_db))  return res.status(400).json({ ok:false, error:"Invalid pay_mode" });

      // UPDATE
      if (b.id) {
        const { rows } = await pool.query(
          `UPDATE drivers
              SET name=$2,
                  phone=$3,
                  email=$4,
                  license_number=$5,
                  work_mode=$6,
                  pay_mode=$7,         -- minúscula
                  active=$8,
                  updated_at = now()
            WHERE id::text = $1
        RETURNING id::text AS id, name, phone, email, license_number, work_mode, pay_mode, active, created_at`,
          [b.id, b.name, b.phone, b.email, b.license_number, b.work_mode, b.pay_mode_db, b.active]
        );
        if (!rows.length) return res.status(404).json({ ok:false, error:"Driver not found" });
        return res.json({ ok:true, driver: rowToUi(rows[0]) });
      }

      // INSERT
      const { rows } = await pool.query(
        `INSERT INTO drivers (name, phone, email, license_number, work_mode, pay_mode, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id::text AS id, name, phone, email, license_number, work_mode, pay_mode, active, created_at`,
        [b.name, b.phone, b.email, b.license_number, b.work_mode, b.pay_mode_db, b.active]
      );
      return res.json({ ok:true, driver: rowToUi(rows[0]) });
    }

    /* ---------- DELETE ---------- */
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok:false, error:"Missing id" });
      const { rowCount } = await pool.query(`DELETE FROM drivers WHERE id::text = $1`, [id]);
      if (!rowCount) return res.status(404).json({ ok:false, error:"Driver not found" });
      return res.json({ ok:true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok:false, error:"Method Not Allowed" });

  } catch (e) {
    // Mapea errores PG conocidos (CHECK, NOT NULL, etc.) a 400
    if (e && e.code === '23514') { // check_violation
      return res.status(400).json({ ok:false, error: e.detail || 'Check constraint violation' });
    }
    if (e && e.code === '23502') { // not_null_violation
      return res.status(400).json({ ok:false, error: e.column + ' is required' });
    }
    console.error("[/api/admin/drivers] error:", e);
    return res.status(500).json({ ok:false, error: e?.message || "Internal error" });
  }
}

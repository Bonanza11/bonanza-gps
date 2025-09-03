// /api/admin/vehicles.js
// /api/admin/drivers.js
import { pool, query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  return {
    id: body.id ? String(body.id) : null,
    name: (body.name ?? "").toString().trim(),
    email: (body.email ?? "").toString().trim() || null,
    phone: (body.phone ?? "").toString().trim() || null,
    license_number: (body.license_number ?? "").toString().trim() || null,
    // UI envía '24h' | 'custom'
    work_mode: ((body.work_mode ?? "24h").toString().trim() || "24h").toLowerCase(),
    // UI envía PER_RIDE | HOURLY | PER_LOAD
    pay_mode: (dPayMode.value || 'per_ride') , toString().trim().toUpperCase(),
    active: body.active !== false
  };
}

async function handler(req, res) {
  try {
    // ===== GET: list =====
    if (req.method === "GET") {
      const rows = await query(`
        SELECT
          id::text AS id,
          name,
          email,
          phone,
          pay_mode,
          license_number,
          work_mode,
          active,
          created_at
        FROM drivers
        ORDER BY created_at DESC
        LIMIT 500
      `);
      return res.json({ ok: true, drivers: rows });
    }

    // ===== POST: create / update =====
    if (req.method === "POST") {
      const b = norm(req.body || {});

      // Validaciones propias de DRIVERS (no plate!)
      if (!b.name) {
        return res.status(400).json({ ok: false, error: "Missing name" });
      }
      const validPay = ["PER_RIDE", "HOURLY", "PER_LOAD"];
      if (!validPay.includes(b.pay_mode)) {
        return res.status(400).json({ ok: false, error: "Invalid pay_mode" });
      }
      const validWork = ["24h", "custom"];
      if (!validWork.includes(b.work_mode)) {
        return res.status(400).json({ ok: false, error: "Invalid work_mode" });
      }

      // ===== UPDATE por id =====
      if (b.id) {
        const { rows } = await pool.query(
          `UPDATE drivers
              SET name = $2,
                  email = $3,
                  phone = $4,
                  pay_mode = $5,
                  license_number = $6,
                  work_mode = $7,
                  active = $8,
                  updated_at = now()
            WHERE id::text = $1
        RETURNING id::text AS id, name, email, phone, pay_mode, license_number, work_mode, active, created_at`,
          [b.id, b.name, b.email, b.phone, b.pay_mode, b.license_number, b.work_mode, b.active]
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "Driver not found" });
        }
        return res.json({ ok: true, driver: rows[0] });
      }

      // ===== INSERT =====
      const { rows } = await pool.query(
        `INSERT INTO drivers (name, email, phone, pay_mode, license_number, work_mode, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id::text AS id, name, email, phone, pay_mode, license_number, work_mode, active, created_at`,
        [b.name, b.email, b.phone, b.pay_mode, b.license_number, b.work_mode, b.active]
      );
      return res.json({ ok: true, driver: rows[0] });
    }

    // ===== DELETE: by id =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`DELETE FROM drivers WHERE id::text = $1`, [id]);
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

export default requireAuth(["OWNER", "ADMIN", "DISPATCHER"])(handler);

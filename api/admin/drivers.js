// /api/admin/drivers.js
import { pool, query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Normaliza body ---------- */
function norm(body = {}) {
  // normalizar pay_mode
  const rawPay = (body.pay_mode ?? "per_ride").toString().trim().toLowerCase();
  const payMap = {
    "per_ride": "per_ride",
    "per-ride": "per_ride",
    "hourly": "hourly",
    "per_load": "revenue_share", // legado
    "revenue_share": "revenue_share",
  };
  const pay_mode = payMap[rawPay] ?? "per_ride";

  // normalizar work_mode
  const rawWork = (body.work_mode ?? "24h").toString().trim().toLowerCase();
  const work_mode = ["24h", "custom"].includes(rawWork) ? rawWork : "24h";

  return {
    id: body.id ? String(body.id) : null,
    name: (body.name ?? "").toString().trim(),
    email: ((body.email ?? "").toString().trim()) || null,
    phone: ((body.phone ?? "").toString().trim()) || null,
    license_number: ((body.license_number ?? "").toString().trim()) || null,
    work_mode,
    pay_mode,
    active: body.active !== false,
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
          created_at,
          updated_at
        FROM drivers
        ORDER BY created_at DESC
        LIMIT 500
      `);
      // devolvemos array directo (frontend ya sabe manejarlo)
      return res.json(rows);
    }

    // ===== POST: create / update =====
    if (req.method === "POST") {
      const b = norm(req.body || {});

      if (!b.name) {
        return res.status(400).json({ error: "Missing name" });
      }
      const validPay = ["per_ride", "hourly", "revenue_share"];
      if (!validPay.includes(b.pay_mode)) {
        return res.status(400).json({ error: "Invalid pay_mode" });
      }
      const validWork = ["24h", "custom"];
      if (!validWork.includes(b.work_mode)) {
        return res.status(400).json({ error: "Invalid work_mode" });
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
        RETURNING id::text AS id, name, email, phone, pay_mode, license_number, work_mode, active, created_at, updated_at`,
          [b.id, b.name, b.email, b.phone, b.pay_mode, b.license_number, b.work_mode, b.active]
        );
        if (!rows.length) {
          return res.status(404).json({ error: "Driver not found" });
        }
        return res.json(rows[0]);
      }

      // ===== INSERT =====
      const { rows } = await pool.query(
        `INSERT INTO drivers (name, email, phone, pay_mode, license_number, work_mode, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id::text AS id, name, email, phone, pay_mode, license_number, work_mode, active, created_at, updated_at`,
        [b.name, b.email, b.phone, b.pay_mode, b.license_number, b.work_mode, b.active]
      );
      return res.json(rows[0]);
    }

    // ===== DELETE: by id =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ error: "Missing id" });
      const { rowCount } = await pool.query(`DELETE FROM drivers WHERE id::text = $1`, [id]);
      if (!rowCount) return res.status(404).json({ error: "Driver not found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/drivers] error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}

export default requireAuth(["OWNER", "ADMIN", "DISPATCHER"])(handler);

// /api/drivers/index.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

// Forzamos runtime Node (pg no funciona en Edge)
export const config = { runtime: "nodejs" };

async function handler(req, res) {
  try {
    // ===== GET: lista plana =====
    if (req.method === "GET") {
      const { rows } = await query(`
        SELECT
          id::text AS id,
          name, email, phone,
          pay_mode, hourly_rate, per_ride_rate, revenue_share,
          notify_email, notify_sms, created_at
        FROM drivers
        ORDER BY created_at DESC
      `);
      return res.json(rows); // array plano
    }

    // ===== POST: crear / actualizar =====
    if (req.method === "POST") {
      const {
        id = null,
        name,
        email = null,
        phone = null,
        pay_mode = "per_ride",
        hourly_rate = null,
        per_ride_rate = null,
        revenue_share = null,
        notify_email = true,
        notify_sms = false,
      } = req.body || {};

      if (!name) return res.status(400).json({ ok: false, error: "name_required" });

      if (id) {
        const { rows } = await query(
          `
          UPDATE drivers
             SET name=$2,email=$3,phone=$4,
                 pay_mode=$5,hourly_rate=$6,per_ride_rate=$7,revenue_share=$8,
                 notify_email=$9,notify_sms=$10
           WHERE id::text=$1
       RETURNING id::text AS id, name, email, phone, pay_mode, hourly_rate, per_ride_rate,
                 revenue_share, notify_email, notify_sms, created_at
          `,
          [id, name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
        );
        if (!rows?.length) return res.status(404).json({ ok: false, error: "not_found" });
        return res.json(rows[0]); // objeto
      }

      const { rows } = await query(
        `
        INSERT INTO drivers
          (name,email,phone,pay_mode,hourly_rate,per_ride_rate,revenue_share,notify_email,notify_sms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id::text AS id, name, email, phone, pay_mode, hourly_rate, per_ride_rate,
                  revenue_share, notify_email, notify_sms, created_at
      `,
        [name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
      );
      return res.json(rows[0]); // objeto
    }

    // ===== DELETE =====
    if (req.method === "DELETE") {
      const id = String(req.query?.id || "");
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
      const { rowCount } = await query(`DELETE FROM drivers WHERE id::text=$1`, [id]);
      if (!rowCount) return res.status(404).json({ ok: false, error: "not_found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[/api/drivers]", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

// Protegido por roles
export default requireAuth(["OWNER", "ADMIN", "DISPATCHER"])(handler);

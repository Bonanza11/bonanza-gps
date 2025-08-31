// /api/drivers/index.js
import { query } from "../_db.js";
const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // ---------- GET ----------
    if (req.method === "GET") {
      const rows = await query(
        `SELECT id, name, email, phone, pay_mode,
                hourly_rate, per_ride_rate, revenue_share,
                notify_email, notify_sms, created_at
           FROM drivers
           ORDER BY created_at DESC`
      );
      return res.json(Array.isArray(rows) ? rows : []);
    }

    // ---------- POST ----------
    if (req.method === "POST") {
      const {
        name,
        email = null,
        phone = null,
        pay_mode = "per_ride",     // 'associate' | 'hourly' | 'per_ride'
        hourly_rate = null,
        per_ride_rate = null,
        revenue_share = null,      // 0.0 a 1.0
        notify_email = true,
        notify_sms = false
      } = req.body || {};

      if (!name) return res.status(400).json({ ok: false, error: "missing_name" });

      const rows = await query(
        `INSERT INTO drivers
           (name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
      );
      return res.json(rows?.[0] ?? null);
    }

    // ---------- PATCH ----------
    if (req.method === "PATCH") {
      const {
        id,
        name = undefined,
        email = undefined,
        phone = undefined,
        pay_mode = undefined,
        hourly_rate = undefined,
        per_ride_rate = undefined,
        revenue_share = undefined,
        notify_email = undefined,
        notify_sms = undefined
      } = req.body || {};

      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

      const rows = await query(
        `UPDATE drivers SET
            name          = COALESCE($2,  name),
            email         = COALESCE($3,  email),
            phone         = COALESCE($4,  phone),
            pay_mode      = COALESCE($5,  pay_mode),
            hourly_rate   = COALESCE($6,  hourly_rate),
            per_ride_rate = COALESCE($7,  per_ride_rate),
            revenue_share = COALESCE($8,  revenue_share),
            notify_email  = COALESCE($9,  notify_email),
            notify_sms    = COALESCE($10, notify_sms)
         WHERE id = $1
         RETURNING *`,
        [id, name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
      );
      return res.json(rows?.[0] ?? null);
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (err) {
    console.error("[/api/drivers] ", err);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(err?.message || err) });
  }
}

// /api/drivers/index.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Helpers ---------- */
function parseBody(maybe) {
  if (maybe == null) return {};
  if (typeof maybe === "string") {
    try { return JSON.parse(maybe || "{}"); }
    catch { return {}; }
  }
  if (typeof maybe === "object") return maybe;
  return {};
}
function asRows(r) { return (r && Array.isArray(r.rows)) ? r.rows : (Array.isArray(r) ? r : []); }
function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function norm(body = {}) {
  const clean = (v) => (v == null ? null : (String(v).trim() || null));
  const pm = String(body.pay_mode ?? "per_ride").toLowerCase().trim();
  const allowed = new Set(["per_ride", "hourly", "revenue_share"]);
  const pay_mode = allowed.has(pm) ? pm : "per_ride";
  return {
    id: clean(body.id),
    name: clean(body.name),
    email: clean((body.email || "")?.toLowerCase()),
    phone: clean(body.phone),
    pay_mode,
    hourly_rate: toNum(body.hourly_rate),
    per_ride_rate: toNum(body.per_ride_rate),
    revenue_share: toNum(body.revenue_share),
    notify_email: typeof body.notify_email === "boolean" ? body.notify_email : true,
    notify_sms: typeof body.notify_sms === "boolean" ? body.notify_sms : false,
    active: typeof body.active === "boolean" ? body.active : true,
  };
}

/* ---------- Handler ---------- */
async function coreHandler(req, res) {
  // GET: lista
  if (req.method === "GET") {
    const q = await query(`
      SELECT
        id::text AS id,
        name, email, phone, active,
        pay_mode, hourly_rate, per_ride_rate, revenue_share,
        notify_email, notify_sms, created_at
      FROM drivers
      ORDER BY created_at DESC NULLS LAST
    `);
    return res.status(200).json(asRows(q));
  }

  // POST: create/update
  if (req.method === "POST") {
    const d = norm(parseBody(req.body));

    if (!d.name) return res.status(400).json({ ok:false, error:"name_required" });
    if (d.pay_mode === "hourly" && d.hourly_rate == null)
      return res.status(400).json({ ok:false, error:"hourly_rate_required" });
    if (d.pay_mode === "per_ride" && d.per_ride_rate == null)
      return res.status(400).json({ ok:false, error:"per_ride_rate_required" });
    if (d.pay_mode === "revenue_share" && d.revenue_share == null)
      return res.status(400).json({ ok:false, error:"revenue_share_required" });

    try {
      if (d.id) {
        const q = await query(
          `
          UPDATE drivers
             SET name=$2,
                 email=$3,
                 phone=$4,
                 pay_mode=$5,
                 hourly_rate=$6,
                 per_ride_rate=$7,
                 revenue_share=$8,
                 notify_email=$9,
                 notify_sms=$10,
                 active=$11
           WHERE id::text=$1
       RETURNING id::text AS id, name, email, phone, active, pay_mode,
                 hourly_rate, per_ride_rate, revenue_share,
                 notify_email, notify_sms, created_at
          `,
          [
            d.id, d.name, d.email, d.phone,
            d.pay_mode, d.hourly_rate, d.per_ride_rate, d.revenue_share,
            d.notify_email, d.notify_sms, d.active
          ]
        );
        const rows = asRows(q);
        if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });
        return res.json(rows[0]);
      }

      const q = await query(
        `
        INSERT INTO drivers
          (name,email,phone,active,pay_mode,hourly_rate,per_ride_rate,revenue_share,notify_email,notify_sms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id::text AS id, name, email, phone, active, pay_mode,
                  hourly_rate, per_ride_rate, revenue_share,
                  notify_email, notify_sms, created_at
        `,
        [
          d.name, d.email, d.phone, d.active, d.pay_mode,
          d.hourly_rate, d.per_ride_rate, d.revenue_share,
          d.notify_email, d.notify_sms
        ]
      );
      return res.json(asRows(q)[0]);
    } catch (e) {
      // 23505 = unique_violation (Postgres)
      if (e?.code === "23505") {
        const detail = (e?.detail || "").toLowerCase();
        if (detail.includes("drivers_email_key")) {
          return res.status(409).json({ ok:false, error:"email_taken" });
        }
      }
      console.error("[/api/drivers POST] error:", e);
      return res.status(500).json({ ok:false, error:"server_error" });
    }
  }

  // DELETE
  if (req.method === "DELETE") {
    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ ok:false, error:"missing_id" });

    const q = await query(`DELETE FROM drivers WHERE id::text=$1 RETURNING id`, [id]);
    if (!asRows(q).length) return res.status(404).json({ ok:false, error:"not_found" });
    return res.json({ ok:true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok:false, error:"method_not_allowed" });
}

// Protegido para HQ (x-admin-key) y roles
export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(async (req, res) => {
  try {
    await coreHandler(req, res);
  } catch (e) {
    console.error("[/api/drivers] Error:", e);
    res.status(500).json({ ok:false, error:"server_error" });
  }
});

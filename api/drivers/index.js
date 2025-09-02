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

// Normaliza resultado de query: soporta {rows:[...]} o [...] directo
function asRows(r) {
  if (r && Array.isArray(r.rows)) return r.rows;
  if (Array.isArray(r)) return r;
  return [];
}

// Convierte a número o null (evita NaN y '' -> null)
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
  };
}

/* ---------- Handler ---------- */
async function handler(req, res) {
  try {
    /* ===== GET: lista ===== */
    if (req.method === "GET") {
      const q = await query(`
        SELECT
          id::text AS id,
          name, email, phone,
          pay_mode, hourly_rate, per_ride_rate, revenue_share,
          notify_email, notify_sms, created_at
        FROM drivers
        ORDER BY created_at DESC NULLS LAST
      `);
      const rows = asRows(q);
      return res.status(200).json(rows); // siempre JSON (aunque [])
    }

    /* ===== POST: create / update ===== */
    if (req.method === "POST") {
      const body = parseBody(req.body);
      const d = norm(body);

      if (!d.name) {
        return res.status(400).json({ ok: false, error: "name_required" });
      }
      if (d.pay_mode === "hourly" && d.hourly_rate == null) {
        return res.status(400).json({ ok: false, error: "hourly_rate_required" });
      }
      if (d.pay_mode === "per_ride" && d.per_ride_rate == null) {
        return res.status(400).json({ ok: false, error: "per_ride_rate_required" });
      }
      if (d.pay_mode === "revenue_share" && d.revenue_share == null) {
        return res.status(400).json({ ok: false, error: "revenue_share_required" });
      }

      // UPDATE por id
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
                 notify_sms=$10
           WHERE id::text=$1
       RETURNING id::text AS id, name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms, created_at
        `,
          [
            d.id, d.name, d.email, d.phone,
            d.pay_mode, d.hourly_rate, d.per_ride_rate, d.revenue_share,
            d.notify_email, d.notify_sms
          ]
        );

        const rows = asRows(q);
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "not_found" });
        }
        return res.json(rows[0]);
      }

      // INSERT
      const q = await query(
        `
        INSERT INTO drivers
          (name,email,phone,pay_mode,hourly_rate,per_ride_rate,revenue_share,notify_email,notify_sms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id::text AS id, name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms, created_at
      `,
        [
          d.name, d.email, d.phone, d.pay_mode,
          d.hourly_rate, d.per_ride_rate, d.revenue_share,
          d.notify_email, d.notify_sms
        ]
      );
      const rows = asRows(q);
      return res.json(rows[0]); // seguro
    }

    /* ===== DELETE ===== */
    if (req.method === "DELETE") {
      const id = String(req.query?.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

      // Usamos RETURNING para contar afectados aunque no tengamos rowCount
      const q = await query(`DELETE FROM drivers WHERE id::text=$1 RETURNING 1`, [id]);
      const rows = asRows(q);
      if (!rows.length) return res.status(404).json({ ok: false, error: "not_found" });

      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  } catch (e) {
  console.error("[/api/drivers] Error detallado:", e);  // <-- más información en logs
  return res.status(500).json({
    ok: false,
    error: "server_error",
    detail: e?.stack || e?.message || String(e)
  });
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

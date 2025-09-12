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

function asRows(r) {
  if (r && Array.isArray(r.rows)) return r.rows;
  if (Array.isArray(r)) return r;
  return [];
}

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

  const email = clean((body.email || "").toLowerCase());
  return {
    id: clean(body.id),
    name: clean(body.name),
    email,
    phone: clean(body.phone),
    pay_mode,
    hourly_rate: toNum(body.hourly_rate),
    per_ride_rate: toNum(body.per_ride_rate),
    revenue_share: toNum(body.revenue_share),
    notify_email: typeof body.notify_email === "boolean" ? body.notify_email : true,
    notify_sms: typeof body.notify_sms === "boolean" ? body.notify_sms : false,
    // campos opcionales que tal vez tengas en el modal:
    license_no: clean(body.license_no),
    work_mode: clean(body.work_mode), // p.e. '24h'
    active: typeof body.active === "boolean" ? body.active : true,
  };
}

/* ---------- Handler ---------- */
async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = await query(`
        SELECT
          id::text AS id,
          name, email, phone,
          pay_mode, hourly_rate, per_ride_rate, revenue_share,
          notify_email, notify_sms,
          license_no, work_mode, active,
          created_at
        FROM drivers
        ORDER BY created_at DESC NULLS LAST
      `);
      return res.status(200).json(asRows(q));
    }

    if (req.method === "POST") {
      const body = parseBody(req.body);
      const d = norm(body);

      if (!d.name)  return res.status(400).json({ ok:false, error:"name_required" });
      if (!d.email) return res.status(400).json({ ok:false, error:"email_required" });

      if (d.pay_mode === "hourly" && d.hourly_rate == null)
        return res.status(400).json({ ok:false, error:"hourly_rate_required" });
      if (d.pay_mode === "per_ride" && d.per_ride_rate == null)
        return res.status(400).json({ ok:false, error:"per_ride_rate_required" });
      if (d.pay_mode === "revenue_share" && d.revenue_share == null)
        return res.status(400).json({ ok:false, error:"revenue_share_required" });

      // --- UPDATE por id (editar)
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
                 license_no=$11,
                 work_mode=$12,
                 active=$13
           WHERE id::text=$1
       RETURNING id::text AS id, name, email, phone, pay_mode,
                 hourly_rate, per_ride_rate, revenue_share,
                 notify_email, notify_sms, license_no, work_mode, active, created_at
          `,
          [
            d.id, d.name, d.email, d.phone,
            d.pay_mode, d.hourly_rate, d.per_ride_rate, d.revenue_share,
            d.notify_email, d.notify_sms, d.license_no, d.work_mode, d.active
          ]
        );
        const rows = asRows(q);
        if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });
        return res.status(200).json(rows[0]);
      }

      // ---------- INSERT (crear) ----------
      try {
        const q = await query(
          `
          INSERT INTO drivers
            (name,email,phone,pay_mode,hourly_rate,per_ride_rate,revenue_share,
             notify_email,notify_sms,license_no,work_mode,active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id::text AS id, name, email, phone, pay_mode,
                    hourly_rate, per_ride_rate, revenue_share,
                    notify_email, notify_sms, license_no, work_mode, active, created_at
          `,
          [
            d.name, d.email, d.phone, d.pay_mode,
            d.hourly_rate, d.per_ride_rate, d.revenue_share,
            d.notify_email, d.notify_sms, d.license_no, d.work_mode, d.active
          ]
        );
        return res.status(201).json(asRows(q)[0]);
      } catch (e) {
        // Manejo fino: email duplicado
        if (e && (e.code === '23505') && /drivers_email_key/i.test(e.constraint || "")) {
          return res.status(409).json({ ok:false, error:"email_exists" });
        }
        console.error("[/api/drivers INSERT] error:", e);
        return res.status(500).json({ ok:false, error:"server_error" });
      }

      /* ===== OPCIÓN UPSERT (SI LA QUIERES) =====
      // Sustituye el bloque de INSERT anterior por este para "crear o actualizar por email"
      const q = await query(
        `
        INSERT INTO drivers
          (name,email,phone,pay_mode,hourly_rate,per_ride_rate,revenue_share,
           notify_email,notify_sms,license_no,work_mode,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (email) DO UPDATE SET
          name=EXCLUDED.name,
          phone=EXCLUDED.phone,
          pay_mode=EXCLUDED.pay_mode,
          hourly_rate=EXCLUDED.hourly_rate,
          per_ride_rate=EXCLUDED.per_ride_rate,
          revenue_share=EXCLUDED.revenue_share,
          notify_email=EXCLUDED.notify_email,
          notify_sms=EXCLUDED.notify_sms,
          license_no=EXCLUDED.license_no,
          work_mode=EXCLUDED.work_mode,
          active=EXCLUDED.active
        RETURNING id::text AS id, name, email, phone, pay_mode,
                  hourly_rate, per_ride_rate, revenue_share,
                  notify_email, notify_sms, license_no, work_mode, active, created_at
        `,
        [
          d.name, d.email, d.phone, d.pay_mode,
          d.hourly_rate, d.per_ride_rate, d.revenue_share,
          d.notify_email, d.notify_sms, d.license_no, d.work_mode, d.active
        ]
      );
      const rows = asRows(q);
      return res.status(200).json(rows[0]);
      ===== FIN OPCIÓN UPSERT ===== */
    }

    if (req.method === "DELETE") {
      const id = String(req.query?.id || "").trim();
      if (!id) return res.status(400).json({ ok:false, error:"missing_id" });

      const q = await query(`DELETE FROM drivers WHERE id::text=$1 RETURNING 1 AS ok`, [id]);
      const rows = asRows(q);
      if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });

      return res.json({ ok:true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });

  } catch (e) {
    console.error("[/api/drivers] Error:", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

// /api/drivers/index.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

/* ---------- Helpers ---------- */
function parseBody(maybe) {
  // Si llega string, intenta JSON.parse; si ya es objeto, devuélvelo tal cual
  if (maybe == null) return {};
  if (typeof maybe === "string") {
    try { return JSON.parse(maybe || "{}"); }
    catch { return {}; }
  }
  if (typeof maybe === "object") return maybe;
  return {};
}

function norm(body = {}) {
  const clean = (v) => (v == null ? null : String(v).trim() || null);

  // modo de pago permitido
  const pm = String(body.pay_mode ?? "per_ride").toLowerCase().trim();
  const allowed = new Set(["per_ride", "hourly", "revenue_share"]);
  const pay_mode = allowed.has(pm) ? pm : "per_ride";

  return {
    id: clean(body.id),
    name: clean(body.name),
    email: clean((body.email || "")?.toLowerCase()),
    phone: clean(body.phone),
    pay_mode,
    hourly_rate: body.hourly_rate != null ? Number(body.hourly_rate) : null,
    per_ride_rate: body.per_ride_rate != null ? Number(body.per_ride_rate) : null,
    revenue_share: body.revenue_share != null ? Number(body.revenue_share) : null,
    notify_email: typeof body.notify_email === "boolean" ? body.notify_email : true,
    notify_sms: typeof body.notify_sms === "boolean" ? body.notify_sms : false,
  };
}

/* ---------- Handler ---------- */
async function handler(req, res) {
  try {
    /* ===== GET: lista ===== */
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
      // IMPORTANTE: el frontend espera array plano
      return res.json(rows);
    }

    /* ===== POST: create / update ===== */
    if (req.method === "POST") {
      // Aseguramos body válido aunque llegue vacío o como texto
      const body = parseBody(req.body);
      const d = norm(body);

      if (!d.name) {
        return res.status(400).json({ ok: false, error: "name_required" });
      }

      // UPDATE por id
      if (d.id) {
        const { rows } = await query(
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

        if (!rows?.length) {
          return res.status(404).json({ ok: false, error: "not_found" });
        }
        // El frontend espera un objeto directo
        return res.json(rows[0]);
      }

      // INSERT
      const { rows } = await query(
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

      return res.json(rows[0]);
    }

    /* ===== DELETE ===== */
    if (req.method === "DELETE") {
      const id = String(req.query?.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

      const { rowCount } = await query(`DELETE FROM drivers WHERE id::text=$1`, [id]);
      if (!rowCount) return res.status(404).json({ ok: false, error: "not_found" });

      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  } catch (e) {
    console.error("[/api/drivers] ", e);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(e?.message || e) });
  }
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

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

// rows: soporta { rows:[...] } o array directo
function asRows(r) {
  if (r && Array.isArray(r.rows)) return r.rows;
  if (Array.isArray(r)) return r;
  return [];
}

// string -> trimmed or null
function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// number -> finite or null
function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// boolean flexible ("true"/"false"/1/0/yes/no)
function toBool(v, def = null) {
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}

function norm(body = {}) {
  const payRaw = String(body.pay_mode ?? "per_ride").toLowerCase().trim();
  const allowed = new Set(["per_ride", "hourly", "revenue_share"]);
  const pay_mode = allowed.has(payRaw) ? payRaw : "per_ride";

  const email = cleanStr((body.email || "")?.toLowerCase());

  return {
    id: cleanStr(body.id),
    name: cleanStr(body.name),
    email,
    phone: cleanStr(body.phone),
    pay_mode,
    hourly_rate: toNum(body.hourly_rate),
    per_ride_rate: toNum(body.per_ride_rate),
    revenue_share: toNum(body.revenue_share),
    notify_email: toBool(body.notify_email, true),
    notify_sms: toBool(body.notify_sms, false),
    active: toBool(body.active, null),     // null => no cambiar
    online: toBool(body.online, null),     // null => no cambiar
    pin: cleanStr(body.pin)                // opcional (p.ej. “1234”)
  };
}

/* ---------- Handler ---------- */
async function handler(req, res) {
  try {
    // ===== GET: lista =====
    if (req.method === "GET") {
      const q = await query(`
        SELECT
          id::text AS id,
          name, email, phone,
          pay_mode, hourly_rate, per_ride_rate, revenue_share,
          notify_email, notify_sms, active, online, created_at
        FROM drivers
        ORDER BY created_at DESC NULLS LAST
      `);
      return res.status(200).json({ ok: true, rows: asRows(q) });
    }

    // ===== POST: create / update =====
    if (req.method === "POST") {
      const body = parseBody(req.body);
      const d = norm(body);

      if (!d.name) {
        return res.status(400).json({ ok:false, error:"name_required" });
      }
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
        return res.status(400).json({ ok:false, error:"invalid_email" });
      }
      if (d.pay_mode === "hourly" && d.hourly_rate == null) {
        return res.status(400).json({ ok:false, error:"hourly_rate_required" });
      }
      if (d.pay_mode === "per_ride" && d.per_ride_rate == null) {
        return res.status(400).json({ ok:false, error:"per_ride_rate_required" });
      }
      if (d.pay_mode === "revenue_share" && d.revenue_share == null) {
        return res.status(400).json({ ok:false, error:"revenue_share_required" });
      }

      // --- Verifica email duplicado (si viene email)
      if (d.email) {
        if (d.id) {
          const dupe = await query(
            `SELECT 1 FROM drivers WHERE lower(email)=lower($1) AND id::text <> $2 LIMIT 1`,
            [d.email, d.id]
          );
          if (asRows(dupe).length) {
            return res.status(409).json({ ok:false, error:"email_in_use" });
          }
        } else {
          const dupe = await query(
            `SELECT 1 FROM drivers WHERE lower(email)=lower($1) LIMIT 1`,
            [d.email]
          );
          if (asRows(dupe).length) {
            return res.status(409).json({ ok:false, error:"email_in_use" });
          }
        }
      }

      // --- UPDATE por id
      if (d.id) {
        // armamos columnas dinámicamente para no sobreescribir con nulls “no intencionales”
        const sets = [
          ["name", d.name],
          ["email", d.email],
          ["phone", d.phone],
          ["pay_mode", d.pay_mode],
          ["hourly_rate", d.hourly_rate],
          ["per_ride_rate", d.per_ride_rate],
          ["revenue_share", d.revenue_share],
          ["notify_email", d.notify_email],
          ["notify_sms", d.notify_sms],
        ];
        if (d.active !== null) sets.push(["active", d.active]);
        if (d.online !== null) sets.push(["online", d.online]);
        if (d.pin !== null)    sets.push(["pin", d.pin]);

        const fields = [];
        const values = [d.id];
        sets.forEach(([col, val], i) => {
          fields.push(`${col} = $${i + 2}`);
          values.push(val);
        });

        const q = await query(
          `
            UPDATE drivers
               SET ${fields.join(", ")}
             WHERE id::text = $1
         RETURNING id::text AS id, name, email, phone, pay_mode,
                   hourly_rate, per_ride_rate, revenue_share,
                   notify_email, notify_sms, active, online, created_at
          `,
          values
        );
        const rows = asRows(q);
        if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });
        return res.json({ ok:true, driver: rows[0] });
      }

      // --- INSERT
      const q = await query(
        `
          INSERT INTO drivers
            (name,email,phone,pay_mode,hourly_rate,per_ride_rate,revenue_share,
             notify_email,notify_sms,active,online,pin)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,true),COALESCE($11,false),$12)
          RETURNING id::text AS id, name, email, phone, pay_mode,
                    hourly_rate, per_ride_rate, revenue_share,
                    notify_email, notify_sms, active, online, created_at
        `,
        [
          d.name, d.email, d.phone, d.pay_mode,
          d.hourly_rate, d.per_ride_rate, d.revenue_share,
          d.notify_email, d.notify_sms,
          d.active, d.online, d.pin
        ]
      );
      const rows = asRows(q);
      return res.json({ ok:true, driver: rows[0] });
    }

    // ===== DELETE =====
    if (req.method === "DELETE") {
      const id = cleanStr(req.query?.id);
      if (!id) return res.status(400).json({ ok:false, error:"missing_id" });

      const q = await query(`DELETE FROM drivers WHERE id::text=$1 RETURNING 1`, [id]);
      if (!asRows(q).length) return res.status(404).json({ ok:false, error:"not_found" });

      return res.json({ ok:true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  } catch (e) {
    console.error("[/api/drivers] error:", e);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: e?.message || String(e)
    });
  }
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

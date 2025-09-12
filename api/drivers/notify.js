// /api/drivers/notify.js
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";
import { sendEmail } from "../email/send.js";

export const config = { runtime: "nodejs" };

/* ========== Helpers ========== */
function parseBody(maybe) {
  if (maybe == null) return {};
  if (typeof maybe === "string") {
    try { return JSON.parse(maybe || "{}"); } catch { return {}; }
  }
  if (typeof maybe === "object") return maybe;
  return {};
}
const strOrNull = v => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const toIntArray = (arr) =>
  Array.isArray(arr)
    ? arr.map(x => (x === "" || x === null || x === undefined ? null : Number(x))).filter(Number.isInteger)
    : [];
const toBool = (v, def=false) => {
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return def;
};

function fmtWhen(ts) {
  try {
    return new Date(ts).toLocaleString("en-US", {
      year:"numeric", month:"short", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    });
  } catch { return String(ts || ""); }
}

function buildPlainText(driver, rides) {
  const header = `Hello ${driver.name || "driver"}, here are your assignments:\n`;
  const lines = rides.map(r =>
    `• ${fmtWhen(r.pickup_time)} — ${r.pickup_location} → ${r.dropoff_location} (${r.customer_name}${r.phone ? ", "+r.phone : ""})`
  );
  return header + (lines.length ? lines.join("\n") : "No assignments in the selected range.");
}

function buildHtml(driver, rides) {
  const rows = rides.map(r => `
    <tr>
      <td>${fmtWhen(r.pickup_time)}</td>
      <td>${escapeHtml(r.pickup_location)}</td>
      <td>${escapeHtml(r.dropoff_location)}</td>
      <td>${escapeHtml(r.customer_name)}${r.phone ? "<br><small>"+escapeHtml(r.phone)+"</small>" : ""}</td>
    </tr>
  `).join("");
  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220">
    <h2 style="margin:0 0 8px">Hi ${escapeHtml(driver.name || "driver")},</h2>
    <p style="margin:0 0 12px">Here are your upcoming assignments:</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#f8fafc">
          <th align="left">When</th>
          <th align="left">Pickup</th>
          <th align="left">Drop-off</th>
          <th align="left">Client</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">No assignments in the selected range.</td></tr>`}</tbody>
    </table>
    <p style="color:#64748b;margin-top:10px">— Bonanza Dispatch</p>
  </div>`;
}
function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ========== Handler ========== */
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error:"method_not_allowed" });
  }

  try {
    const body = parseBody(req.body);

    let {
      driver_id,
      reservation_ids = [],
      channels = { email:true, sms:false },
      from = null,
      to   = null,
      send = false,
      subject = "Your Bonanza assignments"
    } = body || {};

    if (!driver_id) return res.status(400).json({ error:"missing_driver_id" });

    reservation_ids = toIntArray(reservation_ids);
    from = strOrNull(from);
    to   = strOrNull(to);
    const chEmail = !!(channels && channels.email);
    const chSms   = !!(channels && channels.sms);
    send = toBool(send, false);

    // 1) Driver
    const dres = await query(
      `SELECT id::text AS id, name, email, phone
         FROM drivers
        WHERE id::text = $1
        LIMIT 1`,
      [String(driver_id)]
    );
    const driver = dres?.rows?.[0];
    if (!driver) return res.status(404).json({ error:"driver_not_found" });

    // 2) Rides
    let rides = [];
    if (reservation_ids.length > 0) {
      const r = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE id = ANY($1::int[]) AND driver_id::text = $2
          ORDER BY pickup_time ASC
          LIMIT 200`,
        [reservation_ids, driver.id]
      );
      rides = r.rows || [];
    } else {
      const r = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE driver_id::text = $1
            AND ($2::timestamptz IS NULL OR pickup_time >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR pickup_time <= $3::timestamptz)
            AND (
              ($2::timestamptz IS NOT NULL OR $3::timestamptz IS NOT NULL)
              OR (pickup_time >= NOW() AND pickup_time <= NOW() + INTERVAL '7 days')
            )
          ORDER BY pickup_time ASC
          LIMIT 200`,
        [driver.id, from, to]
      );
      rides = r.rows || [];
    }

    // 3) Build message
    const text = buildPlainText(driver, rides);
    const html = buildHtml(driver, rides);

    // 4) Preview object
    const preview = {
      to_email: chEmail ? (driver.email || null) : null,
      to_phone: chSms ? (driver.phone || null) : null,
      subject,
      text
    };

    // 5) Send (email) if requested
    let sentEmail = false;
    if (send && chEmail && driver.email) {
      await sendEmail({
        to: driver.email,
        subject,
        html,
        text
      });
      sentEmail = true;

      // log opcional
      try {
        await query(
          `INSERT INTO driver_notifications (driver_id, channel, subject, payload, created_at)
           VALUES ($1::uuid, 'email', $2, $3::jsonb, NOW())`,
          [driver.id, subject, JSON.stringify({ reservation_ids, from, to, count: rides.length })]
        );
      } catch { /* no romper si la tabla no existe */ }
    }

    return res.json({
      preview,
      channels: { email: chEmail, sms: chSms },
      counts: { rides: rides.length },
      sent: { email: sentEmail, sms: false }
    });
  } catch (err) {
    console.error("[/api/drivers/notify] error:", err);
    return res.status(500).json({ error:"server_error", detail: err?.message || String(err) });
  }
}

export default requireAuth(["OWNER","ADMIN","DISPATCHER"])(handler);

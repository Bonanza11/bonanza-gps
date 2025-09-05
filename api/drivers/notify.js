// /api/drivers/notify.js
// POST: genera y devuelve un preview del mensaje para email/SMS al driver
// Body:
// {
//   "driver_id": "uuid",
//   "reservation_ids": [123, 124],       // opcional; si no viene, usa rango o próximos 7 días
//   "channels": { "email": true, "sms": false },
//   "from": "2025-09-01T00:00:00Z",      // opcional si no pasas reservation_ids
//   "to":   "2025-09-07T23:59:59Z"       // opcional si no pasas reservation_ids
// }
import { query } from "../_db.js";

const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

// Construye texto compacto de asignaciones
function buildMessage(driver, rides) {
  const header = `Hola ${driver.name}, estas son tus asignaciones:\n`;
  const lines = rides.map(r =>
    `• ${new Date(r.pickup_time).toLocaleString()} — ${r.pickup_location} → ${r.dropoff_location} (${r.customer_name}${r.phone ? ", " + r.phone : ""})`
  );
  return header + (lines.length ? lines.join("\n") : "No tienes asignaciones en el rango seleccionado.");
}

// Helpers
const strOrNull = v => (v === undefined || v === null || String(v).trim() === "" ? null : String(v));
const toIntArray = (arr) => Array.isArray(arr)
  ? arr.map(x => (x === "" || x === null || x === undefined ? null : Number(x))).filter(Number.isInteger)
  : [];

export default async function handler(req, res) {
  try {
    // --- Auth: solo HQ por x-admin-key de momento ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    // Asegura body JSON por si no viene parseado
    let body = req.body;
    if (!body) {
      const raw = await new Promise((resolve) => {
        let data = ""; req.on("data", c => data += c); req.on("end", () => resolve(data));
      });
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    }

    let {
      driver_id,
      reservation_ids = [],
      channels = { email: true, sms: false },
      from = null,
      to   = null
    } = body || {};

    if (!driver_id) return res.status(400).json({ ok: false, error: "missing_driver_id" });

    // Normaliza
    driver_id = String(driver_id);
    reservation_ids = toIntArray(reservation_ids);
    from = strOrNull(from);
    to   = strOrNull(to);

    // 1) Driver
    const { rows: drows } = await query(
      `select id, name, email, phone from drivers where id = $1::uuid limit 1`,
      [driver_id]
    );
    const driver = drows[0];
    if (!driver) return res.status(404).json({ ok: false, error: "driver_not_found" });

    // 2) Rides
    let rides = [];
    if (reservation_ids.length > 0) {
      const { rows } = await query(
        `select id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           from reservations
          where id = any($1::int[]) and driver_id = $2::uuid
          order by pickup_time asc`,
        [reservation_ids, driver_id]
      );
      rides = rows;
    } else {
      const { rows } = await query(
        `select id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           from reservations
          where driver_id = $1::uuid
            and ($2::timestamptz is null or pickup_time >= $2::timestamptz)
            and ($3::timestamptz is null or pickup_time <= $3::timestamptz)
            and (
              ($2::timestamptz is not null or $3::timestamptz is not null)
              or (pickup_time >= now() and pickup_time <= now() + interval '7 days')
            )
          order by pickup_time asc`,
        [driver_id, from, to]
      );
      rides = rows;
    }

    const text = buildMessage(driver, rides);

    // 3) Preview (stub)
    const preview = {
      to_email: channels?.email ? (driver.email || null) : null,
      to_phone: channels?.sms ? (driver.phone || null) : null,
      text
    };

    return res.json({
      ok: true,
      preview,
      channels: { email: !!(channels && channels.email), sms: !!(channels && channels.sms) },
      counts: { rides: rides.length }
    });

  } catch (err) {
    console.error("[/api/drivers/notify] ", err);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(err?.message || err) });
  }
}

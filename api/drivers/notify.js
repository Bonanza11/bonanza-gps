// /api/drivers/notify.js
// POST: genera y devuelve un preview del mensaje a enviar por email/SMS al driver
// Body:
// {
//   "driver_id": "uuid",
//   "reservation_ids": [123,124],             // opcional; si no viene, usa rango o próximos 7 días
//   "channels": { "email": true, "sms": false },
//   "from": "2025-09-01T00:00:00Z",           // opcional si no pasas reservation_ids
//   "to":   "2025-09-07T23:59:59Z"            // opcional si no pasas reservation_ids
// }
import { query } from "../_db.js";

export const config = { runtime: "nodejs" };

const ADMIN = process.env.ADMIN_KEY || "supersecreto123";
const TZ = "America/Denver";

// --- Helpers ---
function isAuthorized(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  return String(hdr || "") === String(ADMIN);
}

const strOrNull = (v) =>
  v === undefined || v === null || String(v).trim() === "" ? null : String(v);

const toIntArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) =>
      x === "" || x === null || x === undefined ? null : Number(x)
    )
    .filter((x) => Number.isInteger(x));
};

function normalizeChannels(ch) {
  const c = ch && typeof ch === "object" ? ch : {};
  return { email: !!c.email, sms: !!c.sms };
}

const fmtDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function buildMessage(driver, rides) {
  const header = `Hola ${driver.name || "driver"}, estas son tus asignaciones:\n`;
  if (!rides.length) {
    return header + "No tienes asignaciones en el rango seleccionado.";
  }
  const lines = rides.map((r) => {
    const when = fmtDateTime.format(new Date(r.pickup_time));
    const who =
      r.customer_name + (r.phone ? `, ${r.phone}` : "");
    return `• ${when} — ${r.pickup_location} → ${r.dropoff_location} (${who})`;
  });
  return header + lines.join("\n");
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res
        .status(405)
        .json({ ok: false, error: "method_not_allowed" });
    }

    let {
      driver_id,
      reservation_ids = [],
      channels = { email: true, sms: false },
      from = null,
      to = null,
    } = req.body || {};

    if (!driver_id) {
      return res
        .status(400)
        .json({ ok: false, error: "missing_driver_id" });
    }

    // Normaliza inputs
    driver_id = String(driver_id);
    reservation_ids = toIntArray(reservation_ids);
    channels = normalizeChannels(channels);
    from = strOrNull(from);
    to = strOrNull(to);

    // Valida rango si se pasó alguno
    if ((from && isNaN(Date.parse(from))) || (to && isNaN(Date.parse(to)))) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_datetime_range" });
    }
    if (from && to && Date.parse(from) > Date.parse(to)) {
      return res
        .status(400)
        .json({ ok: false, error: "from_after_to" });
    }

    // 1) Driver
    const [driver] = await query(
      `select id::text as id, name, email, phone from drivers where id = $1::uuid limit 1`,
      [driver_id]
    );
    if (!driver)
      return res
        .status(404)
        .json({ ok: false, error: "driver_not_found" });

    // 2) Rides
    let rides = [];
    if (reservation_ids.length > 0) {
      rides = await query(
        `select id,
                customer_name, phone,
                pickup_location, dropoff_location,
                pickup_time
           from reservations
          where id = any($1::int[])
            and driver_id = $2::uuid
          order by pickup_time asc`,
        [reservation_ids, driver_id]
      );
    } else {
      // Por defecto: próximos 7 días si no hay rango
      rides = await query(
        `select id,
                customer_name, phone,
                pickup_location, dropoff_location,
                pickup_time
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
    }

    const text = buildMessage(driver, rides);

    // 3) Preview (todavía sin enviar)
    const preview = {
      to_email: channels.email ? driver.email || null : null,
      to_phone: channels.sms ? driver.phone || null : null,
      text,
    };

    return res.json({
      ok: true,
      preview,
      channels,
      counts: { rides: rides.length },
      rides, // útil para UI de HQ
      driver,
    });
  } catch (err) {
    console.error("[/api/drivers/notify] ", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(err?.message || err),
    });
  }
}

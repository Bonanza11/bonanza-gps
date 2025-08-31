// /api/drivers/notify.js
// POST: genera y devuelve un preview del mensaje a enviar por email/SMS al driver
//       (más adelante conectamos SendGrid/Twilio)
// Body:
// {
//   "driver_id": "uuid",
//   "reservation_ids": [123, 124],       // opcional; si no viene, usa rango o próximos 7 días
//   "channels": { "email": true, "sms": false },
//   "from": "2025-09-01T00:00:00Z",      // opcional si no pasas reservation_ids
//   "to": "2025-09-07T23:59:59Z"         // opcional si no pasas reservation_ids
// }
import { query } from "../_db.js";

const ADMIN = process.env.ADMIN_KEY || "supersecreto123";

// Construye texto compacto de asignaciones
function buildMessage(driver, rides) {
  const header = `Hola ${driver.name}, estas son tus asignaciones:\n`;
  const lines = rides.map(r =>
    `• ${new Date(r.pickup_time).toLocaleString()} — ${r.pickup_location} → ${r.dropoff_location} (${r.customer_name}${r.phone ? ', ' + r.phone : ''})`
  );
  return header + (lines.length ? lines.join("\n") : "No tienes asignaciones en el rango seleccionado.");
}

// Helpers de normalización
const strOrNull = v => (v === undefined || v === null || String(v).trim() === "" ? null : String(v));
const toIntArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => (x === "" || x === null || x === undefined ? null : Number(x)))
    .filter(x => Number.isInteger(x));
};

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (req.headers["x-admin-key"] !== ADMIN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    let {
      driver_id,
      reservation_ids = [],
      channels = { email: true, sms: false },
      from = null,
      to = null
    } = req.body || {};

    if (!driver_id) return res.status(400).json({ ok: false, error: "missing_driver_id" });

    // Normaliza
    driver_id = String(driver_id);
    reservation_ids = toIntArray(reservation_ids);
    from = strOrNull(from);
    to   = strOrNull(to);

    // 1) Driver
    const [driver] = await query(`SELECT * FROM drivers WHERE id = $1::uuid`, [driver_id]);
    if (!driver) return res.status(404).json({ ok: false, error: "driver_not_found" });

    // 2) Rides
    let rides = [];
    if (reservation_ids.length > 0) {
      // enviar exactamente estas reservas (y que pertenezcan al driver)
      rides = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE id = ANY($1::int[]) AND driver_id = $2::uuid
          ORDER BY pickup_time ASC`,
        [reservation_ids, driver_id]
      );
    } else {
      // por defecto: rango custom o próximos 7 días
      rides = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE driver_id = $1::uuid
            AND ($2::timestamptz IS NULL OR pickup_time >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR pickup_time <= $3::timestamptz)
            AND (
              ($2::timestamptz IS NOT NULL OR $3::timestamptz IS NOT NULL)
              OR (pickup_time >= now() AND pickup_time <= now() + interval '7 days')
            )
          ORDER BY pickup_time ASC`,
        [driver_id, from, to]
      );
    }

    const text = buildMessage(driver, rides);

    // 3) Preview de envío (stub)
    // Aquí luego conectaremos proveedores:
    // - SendGrid para email
    // - Twilio para SMS
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

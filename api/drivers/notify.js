// /api/drivers/notify.js
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

    const {
      driver_id,
      reservation_ids = [],             // opcional: IDs específicos
      channels = { email: true, sms: false }, // {email:boolean, sms:boolean}
      from = null,                      // opcional: rango si no pasas reservation_ids
      to = null
    } = req.body || {};

    if (!driver_id) return res.status(400).json({ ok: false, error: "missing_driver_id" });

    const [driver] = await query(`SELECT * FROM drivers WHERE id = $1`, [driver_id]);
    if (!driver) return res.status(404).json({ ok: false, error: "driver_not_found" });

    let rides = [];

    if (Array.isArray(reservation_ids) && reservation_ids.length) {
      // enviar exactamente estas reservas
      rides = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE id = ANY($1::int[]) AND driver_id = $2
          ORDER BY pickup_time ASC`,
        [reservation_ids, driver_id]
      );
    } else {
      // por defecto: próximas 7 días o rango custom
      rides = await query(
        `SELECT id, customer_name, phone, pickup_location, dropoff_location, pickup_time
           FROM reservations
          WHERE driver_id = $1
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

    // 🚧 STUB de envío: aquí luego integraremos proveedores
    // if (channels.email && driver.email) await sendEmail(driver.email, "Tus asignaciones", text);
    // if (channels.sms   && driver.phone) await sendSMS(driver.phone, text);

    return res.json({
      ok: true,
      preview: {
        to_email: channels.email ? (driver.email || null) : null,
        to_phone: channels.sms ? (driver.phone || null) : null,
        text
      },
      channels,
      counts: { rides: rides.length }
    });
  } catch (err) {
    console.error("[/api/drivers/notify] ", err);
    return res.status(500).json({ ok: false, error: "server_error", detail: String(err?.message || err) });
  }
}

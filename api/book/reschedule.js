// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";

const MAX_RESCHEDULES = 2;

function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s){ return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}

export default async function handler(req, res) {
  /* ===== CORS ===== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  // Body esperado:
  // { cn, newDate, newTime, quote:{ newTotal, miles, afterHours, surcharge, mgFee, vehicleType, meetAndGreet } }
  let body = req.body;
  if (typeof body !== "object") {
    try { body = JSON.parse(body || "{}"); } catch { body = {}; }
  }
  const { cn, newDate, newTime, quote = {} } = body || {};

  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"missing_or_invalid_fields" });
  }
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok:false, error:"pickup_must_be_24h_ahead" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1) Traer reserva + contador actual
    const rows = await sql`
      SELECT id, confirmation_number, date_iso, time_hhmm,
             COALESCE(reschedules_count,0) AS reschedules_count,
             COALESCE(reschedules, '[]'::jsonb) AS reschedules
      FROM bookings
      WHERE confirmation_number = ${cn}
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });

    const b = rows[0];

    // 1.a) No permitir cambiar si faltan <24h para el horario actual
    const currentDt = new Date(`${b.date_iso}T${b.time_hhmm}:00`);
    if (currentDt.getTime() - Date.now() < 24*60*60*1000) {
      return res.status(409).json({ ok:false, error:"cannot_reschedule_within_24h_of_current_pickup" });
    }

    // 1.b) Límite de reprogramaciones
    const used = Number(b.reschedules_count || 0);
    if (used >= MAX_RESCHEDULES) {
      return res.status(403).json({ ok:false, error:"reschedule_limit_reached", used });
    }

    // 2) Evento de historial
    const event = {
      at: new Date().toISOString(),
      newDate, newTime,
      quote: {
        newTotal: quote?.newTotal ?? null,
        miles: quote?.miles ?? null,
        afterHours: !!quote?.afterHours,
        surcharge: quote?.surcharge ?? 0,
        mgFee: quote?.mgFee ?? 0,
        vehicleType: quote?.vehicleType || null,
        meetAndGreet: quote?.meetAndGreet || null
      }
    };

    // 3) Actualizar fecha/hora + cotización + contador + historial
    const upd = await sql`
      UPDATE bookings
      SET date_iso       = ${newDate},
          time_hhmm      = ${newTime},
          quoted_total   = ${quote?.newTotal ?? null},
          vehicle_type   = ${quote?.vehicleType || null},
          mg_choice      = ${quote?.meetAndGreet || null},
          distance_miles = ${quote?.miles ?? null},
          updated_at     = NOW(),
          reschedules_count = COALESCE(reschedules_count,0) + 1,
          reschedules = COALESCE(reschedules, '[]'::jsonb) || ${JSON.stringify([event])}::jsonb
      WHERE confirmation_number = ${cn}
      RETURNING confirmation_number,
                date_iso, time_hhmm, quoted_total, vehicle_type, mg_choice, distance_miles,
                COALESCE(reschedules_count,0) AS reschedules_count,
                reschedules;
    `;

    const u = upd[0];

    return res.status(200).json({
      ok:true,
      booking: {
        cn: u.confirmation_number,
        date_iso: u.date_iso,
        time_hhmm: u.time_hhmm,
        quoted_total: u.quoted_total,
        vehicle_type: u.vehicle_type,
        mg_choice: u.mg_choice,
        distance_miles: u.distance_miles,
        reschedulesCount: Number(u.reschedules_count || 0),
        reschedules: u.reschedules
      }
    });
  } catch (err) {
    console.error("[reschedule] error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

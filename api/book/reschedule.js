// /api/book/reschedule.js
import { neon } from "@neondatabase/serverless";

function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function isTime(s){ return /^\d{2}:\d{2}$/.test(s || ""); }
function atLeast24hAhead(dateStr, timeStr){
  if (!isISODate(dateStr) || !isTime(timeStr)) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  const { cn, newDate, newTime } = req.body || {};
  if (!cn || !isISODate(newDate) || !isTime(newTime)) {
    return res.status(400).json({ ok:false, error:"Missing or invalid fields (cn, newDate, newTime)" });
  }
  // La nueva fecha/hora también debe ser con 24h de antelación
  if (!atLeast24hAhead(newDate, newTime)) {
    return res.status(400).json({ ok:false, error:"New pickup must be at least 24h ahead" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // 1) Traer la reserva
    const rows = await sql`
      select id, date_iso, time_hhmm
      from bookings
      where confirmation_number = ${cn}
      limit 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"Booking not found" });

    // 2) Verificar ventana de 24h respecto a la hora actual de la reserva
    const currentISO = rows[0].date_iso;        // tipo DATE
    const currentHHMM = rows[0].time_hhmm;      // texto HH:MM
    const currentDt = new Date(`${currentISO}T${currentHHMM}:00`);
    const msLeft = currentDt.getTime() - Date.now();
    if (msLeft < 24*60*60*1000) {
      return res.status(409).json({ ok:false, error:"Cannot reschedule within 24h of pickup" });
    }

    // 3) Actualizar
    const upd = await sql`
      update bookings
      set date_iso = ${newDate},
          time_hhmm = ${newTime},
          updated_at = now()
      where confirmation_number = ${cn}
      returning id, confirmation_number, date_iso, time_hhmm, updated_at
    `;

    return res.status(200).json({ ok:true, booking: upd[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

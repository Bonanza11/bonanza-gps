// /api/reservations/quote.js
// Cotiza usando la tabla oficial de Bonanza Transportation.
// Entrada (POST JSON):
// {
//   origin_lat?: number, origin_lng?: number,
//   dest_lat?: number,   dest_lng?: number,
//   distance_miles?: number,          // si lo envías, se usa tal cual
//   pickup_time?: string,             // ISO local o "h:mm AM/PM" (define after-hours 25%)
//   extras?: number                   // opcional: peajes/recargos adicionales en USD
// }
//
// Respuesta:
// { ok:true, data: { miles, base, after_hours, extras, subtotal, total, breakdown } }

export const config = { runtime: "nodejs" };

// ---------- helpers ----------
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const ceil2 = (n, step = 1) => Math.ceil(n / step) * step;

// Haversine (mi)
function haversineMiles(oLat, oLng, dLat, dLng) {
  const R = 3958.7613; // millas
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLatR = toRad(dLat - oLat);
  const dLngR = toRad(dLng - oLng);
  const a =
    Math.sin(dLatR / 2) ** 2 +
    Math.cos(toRad(oLat)) * Math.cos(toRad(dLat)) * Math.sin(dLngR / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Tabla oficial de precios por milla
function basePriceFromTable(milesRaw) {
  const m = Math.max(0, Number(milesRaw) || 0);
  // Para tarifas por tramo usamos millas ENTERAS hacia arriba
  const miles = Math.ceil(m);
  if (miles <= 10) return 120;
  if (miles <= 35) return 190;
  if (miles <= 39) return 210;
  if (miles <= 48) return 230;
  if (miles <= 55) return 250;
  // Más de 55: $5.40 × millas (usamos millas reales con 2 decimales)
  return +(5.40 * m).toFixed(2);
}

// After-hours = 25% si fuera de 07:00–22:30
// Acepta ISO (YYYY-MM-DDTHH:mm:ss) o "h:mm AM/PM"
function isAfterHours(pickupInput) {
  if (!pickupInput) return false;
  const s = String(pickupInput).trim().toUpperCase();

  // 1) Intentar AM/PM ("7:05 PM" o "2025-09-25 7:05 PM")
  const m1 = s.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)$/);
  if (m1) {
    let h = parseInt(m1[1], 10);
    const mm = parseInt(m1[2] ?? '0', 10);
    const ap = m1[3];
    if (h < 1 || h > 12 || mm < 0 || mm > 59) return false;
    if (ap === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
    const curMin = (h * 60) + mm;
    const startMin = (7 * 60);         // 07:00
    const endMin   = (22 * 60) + 30;   // 22:30
    return (curMin < startMin) || (curMin > endMin);
  }

  // 2) Intentar ISO / otros (Date interpreta en TZ del servidor)
  const d = new Date(pickupInput);
  if (Number.isNaN(d.getTime())) return false;
  const h = d.getHours();
  const m = d.getMinutes();
  return (h * 60 + m) < (7 * 60) || (h * 60 + m) > (22 * 60 + 30);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const {
      origin_lat, origin_lng,
      dest_lat, dest_lng,
      distance_miles,          // opcional: si lo mandas, se toma como verdad de cliente
      pickup_time,             // ISO local o AM/PM; define after-hours
      extras = 0               // opcional: peajes/recargos externos
    } = req.body || {};

    // 1) Determinar distancia
    let miles = toNum(distance_miles);
    if (miles === null) {
      const oLat = toNum(origin_lat), oLng = toNum(origin_lng);
      const dLat = toNum(dest_lat),   dLng = toNum(dest_lng);
      if ([oLat, oLng, dLat, dLng].every(v => typeof v === "number" && !Number.isNaN(v))) {
        miles = haversineMiles(oLat, oLng, dLat, dLng);
      } else {
        return res.status(400).json({ ok:false, error:"missing_distance_or_coordinates" });
      }
    }

    // 2) Precio base por tabla
    const base = basePriceFromTable(miles);

    // 3) After-hours 25%
    const ah = isAfterHours(pickup_time) ? +(base * 0.25).toFixed(2) : 0;

    // 4) Extras (peajes/recargos adicionales)
    const extraFees = Number.isFinite(Number(extras)) ? +Number(extras).toFixed(2) : 0;

    const subtotal = +(base + ah + extraFees).toFixed(2);
    const total = ceil2(subtotal, 1); // redondeo al entero superior (ajusta step a 5 si quieres)

    return res.status(200).json({
      ok: true,
      data: {
        miles: +miles.toFixed(2),
        base,
        after_hours: ah,
        extras: extraFees,
        subtotal,
        total,
        breakdown: {
          table: "0–10=$120, 11–35=$190, 36–39=$210, 40–48=$230, 49–55=$250, >55=$5.40×mi",
          after_hours_rule: "Fuera de 07:00–22:30 aplica 25%"
        }
      }
    });
  } catch (e) {
    console.error("[/api/reservations/quote] ", e);
    return res.status(500).json({ ok:false, error:"server_error", detail:String(e?.message || e) });
  }
}

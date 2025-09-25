// /api/reservations/quote.js
// Cotiza usando la tabla oficial de Bonanza Transportation.
// Entrada (POST JSON):
// {
//   origin_lat?: number, origin_lng?: number,
//   dest_lat?: number,   dest_lng?: number,
//   distance_miles?: number,          // si lo envías, se usa tal cual
//   pickup_time?: string,             // ISO local "YYYY-MM-DDTHH:MM:SS"
//   extras?: number                   // opcional: peajes/recargos adicionales en USD
// }
//
// Respuesta:
// { ok:true, data: { miles, base, after_hours, extras, subtotal, total, breakdown } }

export const config = { runtime: "nodejs" };

// ---------- helpers ----------
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const ceil2 = (n, step = 1) => Math.ceil(n / step) * step;
const clamp2 = (n) => +Number(n).toFixed(2);

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
  const miles = Math.ceil(m); // tramos con millas enteras
  if (miles <= 10) return 120;
  if (miles <= 35) return 190;
  if (miles <= 39) return 210;
  if (miles <= 48) return 230;
  if (miles <= 55) return 250;
  // Más de 55: $5.40 × millas (usa millas reales con 2 decimales)
  return clamp2(5.40 * m);
}

// After-hours: 25% si fuera de 07:00–22:30 (hora local del ISO entrante)
function isAfterHours(pickupISO) {
  if (!pickupISO) return false;
  const d = new Date(pickupISO);
  if (isNaN(d.getTime())) return false;
  const h = d.getHours();
  const m = d.getMinutes();
  const cur = h * 60 + m;
  const start = 7 * 60;        // 07:00
  const end = 22 * 60 + 30;    // 22:30
  return cur < start || cur > end;
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
      distance_miles,          // opcional: si lo mandas, se toma como verdad del cliente
      pickup_time,             // ISO local; define after-hours (25%)
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
    if (!Number.isFinite(miles) || miles <= 0) {
      return res.status(400).json({ ok:false, error:"invalid_distance" });
    }

    // 2) Precio base por tabla
    const base = basePriceFromTable(miles);

    // 3) After-hours 25%
    const ah = isAfterHours(pickup_time) ? clamp2(base * 0.25) : 0;

    // 4) Extras (si mandas algo distinto de número, se ignora como 0)
    const extraFees = Number.isFinite(Number(extras)) ? clamp2(extras) : 0;

    const subtotal = clamp2(base + ah + extraFees);
    const total = ceil2(subtotal, 1); // redondeo al entero superior

    return res.status(200).json({
      ok: true,
      data: {
        miles: clamp2(miles),
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

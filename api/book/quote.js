// /api/book/quote.js

export const config = { runtime: "nodejs" }; // ✅ Compatible con Vercel

const VEHICLE_TYPES = new Set(["suv", "van"]);
const MG_OPTIONS = new Set(["none", "tsa_exit", "baggage_claim"]);

// Lógica de tarifas (ajústala a tu política real)
function priceCents({ miles, vehicleType, meetGreet, extrasCents = 0 }) {
  // Normalizaciones
  const vt = VEHICLE_TYPES.has(String(vehicleType).toLowerCase())
    ? String(vehicleType).toLowerCase()
    : "suv";
  const mg = MG_OPTIONS.has(String(meetGreet).toLowerCase())
    ? String(meetGreet).toLowerCase()
    : "none";

  const milesFloat = Number(miles);
  const milesRounded = Math.max(0, Math.round(milesFloat * 100) / 100); // 2 decimales

  // Tarifas base
  const base_cents      = vt === "van" ? 15000 : 12000; // $150 / $120
  const per_mile_cents  = vt === "van" ? 350   : 300;   // $3.50 / $3.00

  // Meet & Greet: solo SUV
  const mg_cents = (vt === "suv" && mg !== "none") ? 5000 : 0; // $50

  const extras_cents = Number.isFinite(extrasCents) ? Math.max(0, Math.round(extrasCents)) : 0;

  // Subtotal
  const distance_cents = Math.round(milesRounded * per_mile_cents);
  const subtotal_cents = base_cents + distance_cents + mg_cents + extras_cents;

  // (Opcional) mínimo de viaje
  const MIN_FARE_CENTS = 12000; // $120 mínimo
  const total_cents = Math.max(MIN_FARE_CENTS, subtotal_cents);

  return {
    total_cents,
    breakdown: {
      vehicle_type: vt,
      meet_greet: mg,
      miles: milesRounded,
      base_cents,
      per_mile_cents,
      distance_cents,
      mg_cents,
      extras_cents,
      subtotal_cents,
      min_applied: total_cents > subtotal_cents ? MIN_FARE_CENTS : 0
    }
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const {
      pickup,
      dropoff,
      distance_miles,
      vehicleType = "suv",
      meetGreet = "none",
      extrasCents = 0
    } = req.body || {};

    // Validaciones de campos obligatorios
    if (!pickup || !dropoff) {
      return res.status(400).json({ ok: false, error: "pickup/dropoff required" });
    }

    // Millas válidas
    const miles = Number(distance_miles);
    if (!Number.isFinite(miles) || miles <= 0) {
      return res.status(400).json({ ok: false, error: "distance_miles invalid" });
    }

    // Llamada a la función de precio
    const { total_cents, breakdown } = priceCents({
      miles,
      vehicleType,
      meetGreet,
      extrasCents
    });

    return res.status(200).json({
      ok: true,
      quote: {
        total_cents,
        miles: breakdown.miles,
        breakdown
      }
    });
  } catch (e) {
    console.error("book/quote error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

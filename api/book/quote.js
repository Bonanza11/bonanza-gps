// /api/book/quote.js
import { neon } from "@neondatabase/serverless";

export const config = { runtime: "nodejs" }; // ✅ corregido para Vercel

// EJEMPLO de función de tarificación.
// Ajusta tu lógica real: base, por milla, M&G, vehículo, extras, etc.
function priceCents({ miles, vehicleType, meetGreet, extrasCents = 0 }) {
  const base = vehicleType === "van" ? 15000 : 12000;   // $150 / $120
  const perMile = vehicleType === "van" ? 350 : 300;    // $3.50 / $3.00
  const mgCents = meetGreet && meetGreet !== "none" ? 5000 : 0; // $50
  const subtotal = base + Math.round(miles * perMile) + mgCents + (extrasCents || 0);
  return subtotal;
}

export default async function handler(req, res){
  // CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });

  try {
    const { pickup, dropoff, distance_miles, vehicleType="suv", meetGreet="none", extrasCents=0 } = req.body || {};
    if (!pickup || !dropoff) return res.status(400).json({ ok:false, error:"pickup/dropoff required" });

    // Si ya traes miles desde front (Google DistanceMatrix) úsalo.
    // Si prefieres calcular en backend, agrega aquí tu Distance Matrix/DB lookup.

    const miles = Number(distance_miles);
    if (!Number.isFinite(miles) || miles <= 0) {
      return res.status(400).json({ ok:false, error:"distance_miles invalid" });
    }

    const total_cents = priceCents({ miles, vehicleType, meetGreet, extrasCents });
    return res.status(200).json({ ok:true, quote:{ total_cents, miles } });
  } catch (e) {
    console.error("book/quote error:", e);
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
}

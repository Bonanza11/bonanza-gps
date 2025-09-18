// ===========================================================
// Bonanza Transportation - API Ping
// Archivo: /api/ping.js
// ===========================================================

import { dbPing } from "./_db.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // CORS básico (seguro por defecto). Si todo es mismo dominio, no estorba.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { key } = req.query || {};
  const ADMIN_KEY = process.env.ADMIN_KEY;

  if (!ADMIN_KEY || !key || key !== ADMIN_KEY) {
    // Nunca logueamos la clave recibida
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const alive = await dbPing(); // true si la DB responde
    return res.status(200).json({
      ok: true,
      // compatibilidad hacia adelante y hacia atrás
      message: "pong",
      db: alive === true,   // boolean simple
      db_alive: !!alive     // campo redundante por compatibilidad
    });
  } catch (err) {
    console.error("[/api/ping] DB error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "db_error"
      // en prod no exponemos detalles
    });
  }
}

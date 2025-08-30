// /api/telemetry/ingest.js
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Seguridad opcional: header secreto (configura TELEMETRY_SECRET en Vercel)
    const secret = process.env.TELEMETRY_SECRET;
    if (secret) {
      const got = req.headers['x-telemetry-secret'];
      if (got !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }

    const { token, lat, lng, status } = req.body || {};

    if (!token || lat == null || lng == null) {
      return res.status(400).json({ error: 'Missing fields: token, lat, lng are required' });
    }

    // Validaciones básicas
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
      UPDATE vehicles
      SET last_lat = ${latNum},
          last_lng = ${lngNum},
          last_ping = now(),
          status   = ${status || 'idle'},
          updated_at = now()
      WHERE tracker_token = ${token}
      RETURNING id, plate, driver_name, last_lat, last_lng, last_ping, status;
    `;

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle not found for this token' });
    }

    // Respuesta estándar
    return res.status(200).json({
      ok: true,
      vehicle: rows[0]
    });
  } catch (err) {
    console.error('telemetry.ingest error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

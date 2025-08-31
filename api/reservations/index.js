// GET /api/reservations
import { query } from '../_db.js'; // o '../_db.js' si dejaste el guion

export default async function handler(req, res) {
  try {
    // 🔐 Header simple (opcional si no usas clave en server)
    const ADMIN_KEY = process.env.ADMIN_KEY || 'supersecreto123';
    if (req.headers['x-admin-key'] !== ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok:false, error:'method_not_allowed' });
    }

    const { rows } = await query(`
      SELECT
        id,
        COALESCE(customer_name,'')      AS customer_name,
        COALESCE(phone,'')              AS phone,
        COALESCE(email,'')              AS email,
        COALESCE(pickup_location,'')    AS pickup_location,
        COALESCE(dropoff_location,'')   AS dropoff_location,
        pickup_time,                    -- timestamp
        COALESCE(vehicle_type,'')       AS vehicle_type,
        COALESCE(status,'pending')      AS status
      FROM reservations
      ORDER BY id DESC
    `);

    return res.status(200).json(rows);
  } catch (e) {
    console.error('[GET /reservations] Error:', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
}

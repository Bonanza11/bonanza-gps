// /api/drivers/me/appointments.js
import { requireAuth } from '../../_lib/guard.js';
import { query } from '../../_db.js';

export const config = { runtime: 'nodejs' }; // pg/neon en Node, no Edge

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try {
    const userId = req.user.id;

    // 1) user -> driver
    const d = await query(`select id from drivers where user_id = $1 limit 1`, [userId]);
    if (!d[0]) return res.status(404).json({ ok:false, error:'driver profile not found' });
    const driverId = d[0].id;

    // 2) próximas (y recientes) citas del conductor
    const rows = await query(
      `
      select
        a.id,
        a.pickup_time,
        a.pickup_address,
        a.dropoff_address,
        a.status,
        a.vehicle_id,
        v.plate,
        v.kind
      from appointments a
      left join vehicles v on v.id = a.vehicle_id
      where a.driver_id = $1
        and a.pickup_time between now() - interval '6 hours' and now() + interval '48 hours'
      order by a.pickup_time asc
      `,
      [driverId]
    );

    return res.json({ ok:true, appointments: rows });
  } catch (e) {
    console.error('[drivers/me/appointments]', e);
    return res.status(500).json({ ok:false, error: e.message || 'internal error' });
  }
}

export default requireAuth(['DRIVER'])(handler);

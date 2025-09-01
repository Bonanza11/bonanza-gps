import { requireAuth } from '../../../_lib/guard.js';
import { query } from '../../../_lib/db.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const userId = req.user.id;
  const { id } = req.query;              // reservation id (uuid)
  const { status } = req.body || {};     // STARTED | ARRIVED | DONE | CANCELLED

  // 1) validar input
  const allowed = new Set(['STARTED','ARRIVED','DONE','CANCELLED']);
  if (!status || !allowed.has(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  // 2) mapear user -> driver
  const { rows: d } = await query(`select id from drivers where user_id = $1`, [userId]);
  if (!d[0]) return res.status(404).json({ error: 'driver profile not found' });
  const driverId = d[0].id;

  // 3) verificar que la reserva pertenezca al driver
  const { rows: own } = await query(
    `select 1 from reservations where id = $1 and driver_id = $2`,
    [id, driverId]
  );
  if (!own[0]) return res.status(403).json({ error: 'not your job' });

  // 4) actualizar estado (+ timestamps opcionales)
  await query(
    `update reservations
       set status = $1,
           updated_at = now()
     where id = $2`,
    [status, id]
  );

  // (opcional) timeline:
  // await query(`insert into reservation_events(reservation_id, event, at, actor) values ($1,$2,now(),'driver')`, [id, status]);

  return res.json({ ok: true });
}

export default requireAuth(['DRIVER'])(handler);

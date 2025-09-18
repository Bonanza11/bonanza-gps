// /api/drivers/appointments/[id]/status.js
import { requireAuth } from '../../../_lib/guard.js';
import { query } from '../../../_db.js';

// Transiciones permitidas (normalizamos a UPPERCASE)
const ALLOWED_NEXT = {
  ASSIGNED:  new Set(['STARTED','CANCELLED']),
  STARTED:   new Set(['ARRIVED','CANCELLED']),
  ARRIVED:   new Set(['DONE','CANCELLED']),
  DONE:      new Set([]),
  CANCELLED: new Set([]),
};

const toUC = (x) => (x || '').toString().trim().toUpperCase();

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try {
    const userId = req.user.id;
    const { id } = req.query;
    const next = toUC(req.body?.status);

    if (!id)   return res.status(400).json({ ok:false, error:'missing appointment id' });
    if (!next || !(next in { STARTED:1, ARRIVED:1, DONE:1, CANCELLED:1 })) {
      return res.status(400).json({ ok:false, error:'invalid status; use STARTED|ARRIVED|DONE|CANCELLED' });
    }

    // user -> driver
    const d = await query(`select id from drivers where user_id = $1 limit 1`, [userId]);
    if (!d[0]) return res.status(404).json({ ok:false, error:'driver profile not found' });
    const driverId = d[0].id;

    // validar pertenencia y estado actual
    const rows = await query(
      `select status
         from appointments
        where id = $1
          and driver_id = $2
        limit 1`,
      [id, driverId]
    );
    if (!rows[0]) return res.status(403).json({ ok:false, error:'not your job' });

    const curr = toUC(rows[0].status);
    const allowed = ALLOWED_NEXT[curr];
    if (!allowed || !allowed.has(next)) {
      return res.status(409).json({ ok:false, error:`invalid transition ${curr} -> ${next}` });
    }

    // aplicar update + timestamp del hito
    const tsCol =
      next === 'STARTED' ? 'started_at' :
      next === 'ARRIVED' ? 'arrived_at' :
      next === 'DONE'    ? 'done_at'    : null;

    const sql = `
      update appointments
         set status = $1,
             updated_at = now()
             ${tsCol ? `, ${tsCol} = now()` : ''}
       where id = $2
     returning id, status, driver_id, pickup_time, updated_at
    `;
    const upd = await query(sql, [next, id]);

    return res.json({ ok:true, appointment: upd[0] });
  } catch (e) {
    console.error('[drivers/appointments/[id]/status]', e);
    return res.status(500).json({ ok:false, error: e.message || 'internal error' });
  }
}

export const config = { runtime: 'nodejs' }; // para que funcione con pg/neon
export default requireAuth(['DRIVER'])(handler);

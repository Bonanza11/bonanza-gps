import { requireAuth } from '../../../_lib/guard.js';
import { query } from '../../../_lib/db.js';

const allowedNext = {
  ASSIGNED: new Set(['STARTED','CANCELLED']),
  STARTED:  new Set(['ARRIVED','CANCELLED']),
  ARRIVED:  new Set(['DONE','CANCELLED']),
  DONE:     new Set([]),
  CANCELLED:new Set([])
};

async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end();
  const userId = req.user.id;
  const { id } = req.query;
  const { status: next } = req.body || {};

  // validar input
  if(!next || !(next in {STARTED:1,ARRIVED:1,DONE:1,CANCELLED:1}))
    return res.status(400).json({ error:'invalid status' });

  // mapear user -> driver
  const { rows:d } = await query(`select id from drivers where user_id=$1`, [userId]);
  if(!d[0]) return res.status(404).json({ error:'driver profile not found' });
  const driverId = d[0].id;

  // cargar estado actual y validar pertenencia
  const { rows:r } = await query(
    `select status from reservations where id=$1 and driver_id=$2`,
    [id, driverId]
  );
  if(!r[0]) return res.status(403).json({ error:'not your job' });

  const curr = r[0].status;
  if(!allowedNext[curr] || !allowedNext[curr].has(next))
    return res.status(409).json({ error:`invalid transition ${curr} -> ${next}` });

  // aplicar actualización + timestamp del hito
  const tsCol = next==='STARTED' ? 'started_at'
             : next==='ARRIVED' ? 'arrived_at'
             : next==='DONE'    ? 'done_at' : null;

  const sql = `
    update reservations
       set status=$1, updated_at=now() ${tsCol ? `, ${tsCol}=now()` : ''}
     where id=$2
  `;
  await query(sql, [next, id]);

  res.json({ ok:true });
}

export default requireAuth(['DRIVER'])(handler);

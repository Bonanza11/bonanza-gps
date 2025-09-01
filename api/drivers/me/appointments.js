import { requireAuth } from '../../_lib/guard.js';
import { query } from '../../_lib/db.js';

async function handler(req,res){
  if(req.method!=='GET') return res.status(405).end();
  const userId = req.user.id;

  // consigue driver_id del usuario
  const { rows: d } = await query(`select id from drivers where user_id=$1`, [userId]);
  if(!d[0]) return res.status(404).json({ error:'driver profile not found' });

  const { rows } = await query(`
    select r.id, r.pickup_time, r.pickup_address, r.dropoff_address, r.status,
           v.plate, v.kind
    from reservations r
    left join vehicles v on v.id = r.vehicle_id
    where r.driver_id = $1
      and r.pickup_time between now() - interval '6 hours' and now() + interval '48 hours'
    order by r.pickup_time asc
  `, [d[0].id]);

  res.json({ ok:true, appointments: rows });
}
export default requireAuth(['DRIVER'])(handler);

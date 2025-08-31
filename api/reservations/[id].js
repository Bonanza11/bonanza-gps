// /api/reservations/[id].js
import { query } from '../_db.js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // id debe ser integer
  const resId = Number(id);
  if (!Number.isInteger(resId)) {
    return res.status(400).json({ ok:false, error:'invalid_reservation_id' });
  }

  const { status, vehicle_id, driver_id, pickup_time } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  if (typeof status === 'string') {
    fields.push(`status = $${i++}`);
    values.push(status);
  }

  if (vehicle_id !== undefined) {
    const vid = Number(vehicle_id);
    if (!Number.isInteger(vid)) {
      return res.status(400).json({ ok:false, error:'invalid_vehicle_id' });
    }
    fields.push(`vehicle_id = $${i++}`);
    values.push(vid);
  }

  if (driver_id !== undefined) {
    const did = Number(driver_id);
    if (!Number.isInteger(did)) {
      return res.status(400).json({ ok:false, error:'invalid_driver_id' });
    }
    fields.push(`driver_id = $${i++}`);
    values.push(did);
  }

  if (pickup_time !== undefined) {
    // si te llega string ISO, lo pasas como está; Postgres lo castea a timestamp
    fields.push(`pickup_time = $${i++}`);
    values.push(pickup_time);
  }

  if (!fields.length) {
    return res.status(400).json({ ok:false, error:'nothing_to_update' });
  }

  values.push(resId);
  const sql = `UPDATE reservations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;

  try {
    const { rows } = await query(sql, values);
    return res.status(200).json({ ok:true, reservation: rows[0] });
  } catch (err) {
    console.error('[reservations PATCH] SQL error:', err);
    return res.status(500).json({ ok:false, error:'update_failed' });
  }
}

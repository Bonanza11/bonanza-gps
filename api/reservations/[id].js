// /api/reservations/[id].js
import { query } from '../db.js';   // ruta correcta a _db.js

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const { status, vehicle_id, driver_id, pickup_time } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (typeof status === 'string' && status.trim() !== '') {
      fields.push(`status = $${i++}`);
      values.push(status.trim());
    }

    if (vehicle_id !== undefined) {
      const veh = vehicle_id === null ? null : Number(vehicle_id); // columna integer
      fields.push(`vehicle_id = $${i++}`);
      values.push(veh);
    }

    if (driver_id !== undefined) {
      fields.push(`driver_id = $${i++}`);
      values.push(driver_id); // si luego es integer, castear como arriba
    }

    if (pickup_time !== undefined) {
      fields.push(`pickup_time = $${i++}`);
      values.push(pickup_time);
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    const idValue = /^\d+$/.test(String(id)) ? Number(id) : id;
    values.push(idValue);

    const sql = `UPDATE reservations SET ${fields.join(', ')}
                 WHERE id = $${i} RETURNING *`;

    try {
      const rows = await query(sql, values);     // <-- query devuelve array
      return res.status(200).json({ ok: true, reservation: rows[0] });
    } catch (err) {
      console.error('[reservations PATCH] SQL error:', err);
      return res.status(500).json({ ok: false, error: 'update_failed' });
    }
  }

  res.setHeader('Allow', ['PATCH']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

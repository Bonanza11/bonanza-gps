// /api/reservations/[id].js
import { query } from '../db.js'; // <- ajusta si tu db.js está en otro lugar

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
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
    fields.push(`vehicle_id = $${i++}`);
    values.push(
      vehicle_id === null || vehicle_id === '' ? null : Number(vehicle_id)
    );
  }
  if (driver_id !== undefined) {
    fields.push(`driver_id = $${i++}`);
    values.push(
      driver_id === null || driver_id === '' ? null : Number(driver_id)
    );
  }
  if (pickup_time !== undefined) {
    fields.push(`pickup_time = $${i++}`);
    values.push(pickup_time); // ISO string o formato aceptado por PG
  }

  if (!fields.length) {
    return res.status(400).json({ ok: false, error: 'nothing_to_update' });
  }

  // id de la URL (numérico o texto, según tu schema)
  const idValue = /^\d+$/.test(String(id)) ? Number(id) : id;
  values.push(idValue);

  const sql = `UPDATE reservations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;

  try {
    const { rows } = await query(sql, values);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true, reservation: rows[0] });
  } catch (err) {
    console.error('PATCH /reservations/:id failed', { sql, values, err });
    return res.status(500).json({ ok: false, error: 'update_failed' });
  }
}

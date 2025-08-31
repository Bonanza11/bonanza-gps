// /api/reservations/[id].js
import { query } from '../_db.js';   // <-- ruta correcta (subimos 1 nivel y usamos _db.js)

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const { status, vehicle_id, driver_id, pickup_time } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    // status es texto
    if (typeof status === 'string' && status.trim() !== '') {
      fields.push(`status = $${i++}`);
      values.push(status.trim());
    }

    // vehicle_id es integer en la BD
    if (vehicle_id !== undefined) {
      const veh = vehicle_id === null ? null : Number(vehicle_id);
      fields.push(`vehicle_id = $${i++}`);
      values.push(veh);
    }

    // driver_id por ahora es texto (si luego lo haces integer, castea como arriba)
    if (driver_id !== undefined) {
      fields.push(`driver_id = $${i++}`);
      values.push(driver_id);
    }

    // pickup_time: acepta string ISO o null
    if (pickup_time !== undefined) {
      fields.push(`pickup_time = $${i++}`);
      values.push(pickup_time);
    }

    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    // tu PK id es integer → aseguremos número
    const idValue = /^\d+$/.test(String(id)) ? Number(id) : id;
    values.push(idValue);

    const sql = `UPDATE reservations SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;

    try {
      const { rows } = await query(sql, values);
      return res.status(200).json({ ok: true, reservation: rows[0] });
    } catch (err) {
      console.error('[reservations PATCH] SQL error:', err);
      return res.status(500).json({ ok: false, error: 'update_failed' });
    }
  }

  res.setHeader('Allow', ['PATCH']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

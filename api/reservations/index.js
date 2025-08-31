// /api/reservations/index.js
import { query } from '../db.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const {
        customer_name, email, phone,
        pickup_location, dropoff_location,
        vehicle_type, pickup_time, instructions
      } = req.body;

      const rows = await query(
        `INSERT INTO reservations
         (customer_name,email,phone,pickup_location,dropoff_location,vehicle_type,pickup_time,instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [customer_name, email, phone, pickup_location, dropoff_location, vehicle_type, pickup_time, instructions]
      );

      // rows es un array; toma el primer elemento
      return res.status(201).json({ ok: true, reservation: rows[0] || null });
    } catch (err) {
      console.error('INSERT ERROR', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const rows = await query(
        `SELECT * FROM reservations ORDER BY created_at DESC`
      );
      return res.status(200).json(rows);
    } catch (err) {
      console.error('LIST ERROR', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  res.setHeader('Allow', ['GET','POST']);
  return res.status(405).end('Method Not Allowed');
}

import { q } from '../_lib/db.js';
import { guard, send, jsonBody, assertAdmin } from '../_lib/guard.js';

function cn() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

export default guard(['GET','POST'], async (req, res) => {
  if (req.method === 'GET') {
    assertAdmin(req);
    const { rows } = await q('SELECT * FROM reservations ORDER BY created_at DESC LIMIT 200');
    return send(res, 200, { reservations: rows });
  }

  const b = jsonBody(req);
  const code = b.cn || cn();
  const fields = [code, b.customerName, b.customerEmail, b.phone, b.pickupAt, b.fromAddr, b.toAddr, b.vehicle, Number(b.price||0), 'pending'];

  const { rows } = await q(
    `INSERT INTO reservations
     (cn, customer_name, customer_email, phone, pickup_at, from_addr, to_addr, vehicle, price_usd, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    fields
  );

  send(res, 201, { reservation: rows[0] });
});

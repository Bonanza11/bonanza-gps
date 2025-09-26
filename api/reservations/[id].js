import { q } from '../_lib/db.js';
import { guard, send, jsonBody, assertAdmin } from '../_lib/guard.js';

export default guard(['GET','PUT','DELETE'], async (req, res) => {
  const id = (req.query.id || '').trim();
  if (!id) return send(res, 400, { error: 'Missing id' });

  if (req.method === 'GET') {
    const { rows } = await q('SELECT * FROM reservations WHERE id::text=$1 OR cn=$1', [id]);
    return rows[0] ? send(res, 200, { reservation: rows[0] }) : send(res, 404, { error: 'Not found' });
  }

  assertAdmin(req);

  if (req.method === 'PUT') {
    const b = jsonBody(req);
    const { rows } = await q(
      `UPDATE reservations
       SET pickup_at=COALESCE($2,pickup_at), from_addr=COALESCE($3,from_addr),
           to_addr=COALESCE($4,to_addr), vehicle=COALESCE($5,vehicle),
           price_usd=COALESCE($6,price_usd), status=COALESCE($7,status),
           updated_at=now()
       WHERE id::text=$1 OR cn=$1 RETURNING *`,
      [id, b.pickupAt, b.fromAddr, b.toAddr, b.vehicle, b.price, b.status]
    );
    return rows[0] ? send(res, 200, { reservation: rows[0] }) : send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'DELETE') {
    await q('DELETE FROM reservations WHERE id::text=$1 OR cn=$1', [id]);
    return send(res, 204, {});
  }
});

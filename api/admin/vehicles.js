import { q } from '../_lib/db.js';
import { guard, send, jsonBody, assertAdmin } from '../_lib/guard.js';

export default guard(['GET','POST','PUT','DELETE'], async (req, res) => {
  assertAdmin(req);

  if (req.method === 'GET') {
    const { rows } = await q('SELECT * FROM vehicles ORDER BY id DESC');
    return send(res, 200, { vehicles: rows });
  }

  const b = jsonBody(req);

  if (req.method === 'POST') {
    const { name, plate, capacity } = b;
    if (!name || !plate) return send(res, 400, { error: 'name and plate required' });
    const { rows } = await q(
      'INSERT INTO vehicles (name,plate,capacity) VALUES ($1,$2,$3) RETURNING *',
      [name, plate, capacity ?? 6]
    );
    return send(res, 201, { vehicle: rows[0] });
  }

  if (req.method === 'PUT') {
    const { id, name, plate, capacity } = b;
    const { rows } = await q(
      'UPDATE vehicles SET name=COALESCE($2,name), plate=COALESCE($3,plate), capacity=COALESCE($4,capacity) WHERE id=$1 RETURNING *',
      [id, name, plate, capacity]
    );
    return rows[0] ? send(res, 200, { vehicle: rows[0] }) : send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'DELETE') {
    const { id } = b;
    await q('DELETE FROM vehicles WHERE id=$1', [id]);
    return send(res, 204, {});
  }
});

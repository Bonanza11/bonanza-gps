// api/admin/clients.js
import { q } from '../_lib/db.js';
import { guard, send, jsonBody, assertAdmin } from '../_lib/guard.js';

/**
 * Modelo sugerido (ver migración más abajo):
 * clients(id, name, email, phone, notes, default_pickup_addr, created_at, updated_at)
 */

export default guard(['GET','POST','PUT','DELETE'], async (req, res) => {
  // Solo admin
  assertAdmin(req);

  if (req.method === 'GET') {
    const search = (req.query.search || '').trim();
    if (search) {
      const like = `%${search}%`;
      const { rows } = await q(
        `SELECT * FROM clients
         WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 200`,
        [like]
      );
      return send(res, 200, { clients: rows });
    }
    const { rows } = await q(
      'SELECT * FROM clients ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 200'
    );
    return send(res, 200, { clients: rows });
  }

  const b = jsonBody(req);

  if (req.method === 'POST') {
    const { name, email, phone, notes, defaultPickupAddr } = b;
    if (!name) return send(res, 400, { error: 'name is required' });

    const { rows } = await q(
      `INSERT INTO clients (name, email, phone, notes, default_pickup_addr, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5, now(), now())
       RETURNING *`,
      [name, email || null, phone || null, notes || null, defaultPickupAddr || null]
    );
    return send(res, 201, { client: rows[0] });
  }

  if (req.method === 'PUT') {
    const { id, name, email, phone, notes, defaultPickupAddr } = b;
    if (!id) return send(res, 400, { error: 'id is required' });

    const { rows } = await q(
      `UPDATE clients SET
          name = COALESCE($2, name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          notes = COALESCE($5, notes),
          default_pickup_addr = COALESCE($6, default_pickup_addr),
          updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, name, email, phone, notes, defaultPickupAddr]
    );
    return rows[0] ? send(res, 200, { client: rows[0] }) : send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'DELETE') {
    const { id } = b;
    if (!id) return send(res, 400, { error: 'id is required' });
    await q('DELETE FROM clients WHERE id = $1', [id]);
    return send(res, 204, {});
  }
});

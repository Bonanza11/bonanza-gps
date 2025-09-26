import { q } from '../../../../_lib/db.js';
import { guard, send, jsonBody } from '../../../../_lib/guard.js';

export default guard(['PUT'], async (req, res) => {
  const id = Number(req.query.id || 0);
  const { status } = jsonBody(req);
  if (!id || !status) return send(res, 400, { error: 'Missing id/status' });

  const { rows } = await q(
    'UPDATE assignments SET status=$2, updated_at=now() WHERE id=$1 RETURNING *',
    [id, status]
  );
  return rows[0] ? send(res, 200, { assignment: rows[0] }) : send(res, 404, { error: 'Not found' });
});

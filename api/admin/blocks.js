// api/admin/blocks.js
import { q } from '../_lib/db.js';
import { guard, send, jsonBody, assertAdmin } from '../_lib/guard.js';

/**
 * Modelo sugerido (ver migración):
 * blocks(id, title, starts_at, ends_at, scope, driver_id, vehicle_id, notes, created_at, updated_at)
 *
 * scope: 'global' | 'driver' | 'vehicle'
 * - Si scope='driver' → requiere driver_id
 * - Si scope='vehicle' → requiere vehicle_id
 */

function validateBlockPayload(b) {
  const starts = b.startsAt ? new Date(b.startsAt) : null;
  const ends   = b.endsAt   ? new Date(b.endsAt)   : null;

  if (!b.title || !b.title.trim()) {
    const e = new Error('title is required'); e.status = 400; throw e;
  }
  if (!starts || isNaN(starts)) {
    const e = new Error('startsAt is required and must be a valid date'); e.status = 400; throw e;
  }
  if (!ends || isNaN(ends)) {
    const e = new Error('endsAt is required and must be a valid date'); e.status = 400; throw e;
  }
  if (ends <= starts) {
    const e = new Error('endsAt must be after startsAt'); e.status = 400; throw e;
  }

  const scope = (b.scope || 'global').toLowerCase();
  if (!['global','driver','vehicle'].includes(scope)) {
    const e = new Error("scope must be 'global', 'driver', or 'vehicle'"); e.status = 400; throw e;
  }
  if (scope === 'driver' && !b.driverId) {
    const e = new Error('driverId is required when scope=driver'); e.status = 400; throw e;
  }
  if (scope === 'vehicle' && !b.vehicleId) {
    const e = new Error('vehicleId is required when scope=vehicle'); e.status = 400; throw e;
  }

  return { starts, ends, scope };
}

export default guard(['GET','POST','PUT','DELETE'], async (req, res) => {
  // Solo admin
  assertAdmin(req);

  if (req.method === 'GET') {
    const scope = (req.query.scope || '').toLowerCase();
    const driverId = Number(req.query.driverId || 0);
    const vehicleId = Number(req.query.vehicleId || 0);
    const from = req.query.from ? new Date(req.query.from) : null;
    const to   = req.query.to   ? new Date(req.query.to)   : null;

    // Filtro básico por rango temporal que se solape
    const hasRange = from && to && !isNaN(from) && !isNaN(to);
    const clauses = [];
    const params = [];

    if (scope === 'driver') { params.push('driver'); clauses.push(`scope = $${params.length}`); }
    else if (scope === 'vehicle') { params.push('vehicle'); clauses.push(`scope = $${params.length}`); }
    else if (scope === 'global') { params.push('global'); clauses.push(`scope = $${params.length}`); }

    if (driverId) { params.push(driverId); clauses.push(`driver_id = $${params.length}`); }
    if (vehicleId){ params.push(vehicleId); clauses.push(`vehicle_id = $${params.length}`); }

    if (hasRange) {
      // solapamiento: (starts_at < to) AND (ends_at > from)
      params.push(to.toISOString());   const pTo = params.length;
      params.push(from.toISOString()); const pFrom = params.length;
      clauses.push(`(starts_at < $${pTo} AND ends_at > $${pFrom})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await q(
      `SELECT * FROM blocks
       ${where}
       ORDER BY starts_at DESC
       LIMIT 500`,
      params
    );
    return send(res, 200, { blocks: rows });
  }

  const b = jsonBody(req);

  if (req.method === 'POST') {
    const { starts, ends, scope } = validateBlockPayload(b);

    const { rows } = await q(
      `INSERT INTO blocks (title, starts_at, ends_at, scope, driver_id, vehicle_id, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
       RETURNING *`,
      [
        b.title.trim(),
        starts.toISOString(),
        ends.toISOString(),
        scope,
        scope === 'driver'  ? Number(b.driverId)  : null,
        scope === 'vehicle' ? Number(b.vehicleId) : null,
        b.notes || null
      ]
    );
    return send(res, 201, { block: rows[0] });
  }

  if (req.method === 'PUT') {
    const id = Number(b.id || 0);
    if (!id) return send(res, 400, { error: 'id is required' });

    // Campos opcionales; si pasa startsAt/endsAt, validamos coherencia
    let startsAtISO = null, endsAtISO = null, scope = null;
    if (b.startsAt) {
      const d = new Date(b.startsAt);
      if (isNaN(d)) return send(res, 400, { error: 'startsAt invalid date' });
      startsAtISO = d.toISOString();
    }
    if (b.endsAt) {
      const d = new Date(b.endsAt);
      if (isNaN(d)) return send(res, 400, { error: 'endsAt invalid date' });
      endsAtISO = d.toISOString();
    }
    if (startsAtISO && endsAtISO && endsAtISO <= startsAtISO) {
      return send(res, 400, { error: 'endsAt must be after startsAt' });
    }
    if (b.scope) {
      const s = String(b.scope).toLowerCase();
      if (!['global','driver','vehicle'].includes(s)) {
        return send(res, 400, { error: "scope must be 'global', 'driver', or 'vehicle'" });
      }
      scope = s;
    }

    const { rows } = await q(
      `UPDATE blocks SET
          title = COALESCE($2, title),
          starts_at = COALESCE($3, starts_at),
          ends_at = COALESCE($4, ends_at),
          scope = COALESCE($5, scope),
          driver_id = COALESCE($6, driver_id),
          vehicle_id = COALESCE($7, vehicle_id),
          notes = COALESCE($8, notes),
          updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        b.title ? String(b.title).trim() : null,
        startsAtISO,
        endsAtISO,
        scope,
        b.driverId !== undefined ? (scope === 'driver'  ? Number(b.driverId)  : null) : undefined,
        b.vehicleId !== undefined ? (scope === 'vehicle' ? Number(b.vehicleId) : null) : undefined,
        b.notes ?? null
      ]
    );
    return rows[0] ? send(res, 200, { block: rows[0] }) : send(res, 404, { error: 'Not found' });
  }

  if (req.method === 'DELETE') {
    const id = Number(b.id || 0);
    if (!id) return send(res, 400, { error: 'id is required' });
    await q('DELETE FROM blocks WHERE id = $1', [id]);
    return send(res, 204, {});
  }
});

// /api/admin/drivers/set-shifts.js
import { q } from '../../_lib/db.js';
import { requireAuth } from '../../_lib/guard.js'; // roles OWNER/ADMIN/DISPATCHER

const ALLOWED_MODES = new Set(['24h', 'custom']);

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Si llegó como string (caso edge raro), intenta parsear
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const { driver_id, mode, shifts } = body || {};

  // Validaciones básicas
  if (!driver_id || !mode) {
    return res.status(400).json({ ok: false, error: 'missing_driver_id_or_mode' });
  }
  if (!ALLOWED_MODES.has(mode)) {
    return res.status(400).json({ ok: false, error: 'invalid_mode', hint: 'use 24h or custom' });
  }
  if (mode === 'custom' && !Array.isArray(shifts)) {
    return res.status(400).json({ ok: false, error: 'shifts_must_be_array_for_custom' });
  }

  try {
    // 1) Actualizar modo de trabajo del driver
    await q(
      'UPDATE drivers SET work_mode=$1, updated_at=now() WHERE id=$2',
      [mode, driver_id]
    );

    // 2) Si es custom: limpiar e insertar nuevos turnos
    if (mode === 'custom') {
      await q('DELETE FROM driver_shifts WHERE driver_id=$1', [driver_id]);

      for (const s of shifts) {
        // Validar cada bloque
        if (!s || typeof s.weekday !== 'number' || !s.start_time || !s.end_time) continue;

        await q(
          'INSERT INTO driver_shifts (driver_id, weekday, start_time, end_time, timezone) VALUES ($1,$2,$3,$4,$5)',
          [driver_id, s.weekday, s.start_time, s.end_time, s.timezone || 'America/Denver']
        );
      }
    }

    return res.status(200).json({ ok: true, message: 'shifts_updated' });
  } catch (err) {
    console.error('set-shifts error', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

// Solo OWNER / ADMIN / DISPATCHER pueden tocar horarios
export default requireAuth(['OWNER', 'ADMIN', 'DISPATCHER'])(handler);

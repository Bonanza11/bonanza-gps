// /api/admin/drivers/set-shifts.js
import { neon } from '@neondatabase/serverless';
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

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1) Actualizar modo de trabajo del driver
    await sql`
      UPDATE drivers
      SET work_mode = ${mode}, updated_at = now()
      WHERE id = ${driver_id};
    `;

    // 2) Si es custom: limpiar e insertar nuevos turnos
    if (mode === 'custom') {
      await sql`DELETE FROM driver_shifts WHERE driver_id = ${driver_id};`;

      for (const s of shifts) {
        // Validar cada bloque
        if (
          !s ||
          typeof s.weekday !== 'number' ||
          !s.start_time ||
          !s.end_time
        ) continue;

        await sql`
          INSERT INTO driver_shifts (driver_id, weekday, start_time, end_time, timezone)
          VALUES (
            ${driver_id},
            ${s.weekday},                 -- 0..6 (Dom..Sáb)
            ${s.start_time},              -- 'HH:MM'
            ${s.end_time},                -- 'HH:MM'
            ${s.timezone || 'America/Denver'}
          );
        `;
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

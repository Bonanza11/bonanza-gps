import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { driver_id, mode, shifts } = req.body;

  if (!driver_id || !mode) {
    return res.status(400).json({ ok: false, error: 'Missing driver_id or mode' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1) Actualizar modo de trabajo
    await sql`
      UPDATE drivers
      SET work_mode = ${mode}, updated_at = now()
      WHERE id = ${driver_id};
    `;

    // 2) Limpiar turnos existentes si no es 24h
    if (mode === 'custom' && Array.isArray(shifts)) {
      await sql`DELETE FROM driver_shifts WHERE driver_id = ${driver_id};`;

      // 3) Insertar los nuevos turnos
      for (const s of shifts) {
        if (!s.weekday || !s.start_time || !s.end_time) continue;
        await sql`
          INSERT INTO driver_shifts (driver_id, weekday, start_time, end_time, timezone)
          VALUES (${driver_id}, ${s.weekday}, ${s.start_time}, ${s.end_time}, ${s.timezone || 'America/Denver'});
        `;
      }
    }

    return res.status(200).json({ ok: true, message: 'Shifts updated successfully' });
  } catch (err) {
    console.error('Error updating shifts:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}

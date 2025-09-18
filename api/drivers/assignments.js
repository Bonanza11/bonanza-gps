// /api/drivers/assignments.js
import { query } from '../_db.js';
import { requireAuth } from '../_lib/guard.js';

export const config = { runtime: 'nodejs' }; // aseguramos Node runtime

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  }

  try {
    // Params opcionales (solo HQ); si el rol es DRIVER se ignoran
    let { driver_id, driver_email, from, to } = req.query || {};
    driver_id = (driver_id || '').trim();
    driver_email = (driver_email || '').trim();

    let actingDriverId = null;

    if (req.user?.roles?.includes('DRIVER')) {
      // DRIVER autenticado: mapear user_id -> driver.id y forzar ese id
      const d = await query(`select id from drivers where user_id = $1 limit 1`, [req.user.id]);
      if (!d[0]) return res.status(404).json({ ok:false, error:'driver_profile_not_found' });
      actingDriverId = d[0].id;
    } else {
      // HQ/ADMIN/DISPATCHER: se permite driver_id o resolver por email
      if (!driver_id && driver_email) {
        const found = await query(
          `select id from drivers where lower(email) = lower($1) limit 1`,
          [driver_email]
        );
        driver_id = found[0]?.id || '';
      }
      actingDriverId = driver_id || null;
    }

    if (!actingDriverId) {
      return res.status(400).json({ ok:false, error:'missing_driver_ref' });
    }

    // Ventana: si no pasan 'from' / 'to', usamos -6h / +48h
    // Pasamos los params y dejamos que SQL haga COALESCE con los defaults
    const fromTs = from || null;
    const toTs   = to   || null;

    const rows = await query(
      `
      select
        a.id,
        a.pickup_time,
        a.status,
        a.pickup_address   as pickup,
        a.dropoff_address  as dropoff,
        a.vehicle_pref,
        v.plate            as vehicle_plate,
        v.kind             as vehicle_kind,
        c.name             as client_name,
        c.email            as client_email,
        c.phone            as client_phone,
        a.driver_id
      from appointments a
      left join vehicles v on v.id = a.vehicle_id
      left join clients  c on c.id = a.client_id
      where a.driver_id = $1::uuid
        and a.pickup_time between
            coalesce($2::timestamptz, now() - interval '6 hours')
        and coalesce($3::timestamptz, now() + interval '48 hours')
      order by a.pickup_time asc
      `,
      [actingDriverId, fromTs, toTs]
    );

    return res.json({ ok:true, assignments: rows });
  } catch (e) {
    console.error('[drivers/assignments] error:', e);
    return res.status(500).json({ ok:false, error: e.message || 'internal_error' });
  }
}

export default requireAuth(['DRIVER','DISPATCHER','ADMIN','OWNER'])(handler);

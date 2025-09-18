// /api/admin/vehicles.js
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '../_lib/guard.js';

// Forzar Node runtime si tu proyecto lo requiere (Neon funciona bien en Edge,
// pero si tienes otras deps de Node, déjalo así)
export const config = { runtime: 'nodejs' };

/* -------- Normalización & Validación -------- */
function norm(body = {}) {
  const id = body.id != null && String(body.id).trim() !== '' ? String(body.id) : null;
  const plate = String(body.plate ?? '').trim();
  const driver_name = String(body.driver_name ?? '').trim();
  const kindIn = String(body.kind ?? '').trim().toUpperCase();
  const kind = (kindIn === 'SUV' || kindIn === 'VAN') ? kindIn : 'SUV';
  const year = body.year != null && String(body.year).trim() !== '' ? Number.parseInt(body.year, 10) : null;
  const model = (String(body.model ?? '').trim() || null);
  const active = (typeof body.active === 'boolean') ? body.active : undefined; // para no pisar en update
  return { id, plate, driver_name, kind, year, model, active };
}

function requireFields(v) {
  if (!v.plate || !v.driver_name || !v.year) return false;
  if (!Number.isInteger(v.year) || v.year < 1990 || v.year > 2099) return false;
  return true;
}

/* ------------------ Handler ------------------ */
async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    // ===== GET: lista =====
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id::text AS id, plate, driver_name,
               UPPER(kind) AS kind, year, model, active
          FROM vehicles
         ORDER BY UPPER(kind), UPPER(plate);
      `;
      return res.status(200).json({ ok: true, vehicles: rows });
    }

    // ===== POST: toggle / update / insert (upsert por plate) =====
    if (req.method === 'POST') {
      const body = req.body || {};
      const v = norm(body);

      // 1) Toggle {id, active} estrictamente
      const keys = Object.keys(body);
      const isToggle = v.id && typeof v.active === 'boolean' &&
                       keys.length === 2 && keys.includes('id') && keys.includes('active');

      if (isToggle) {
        const rows = await sql`
          UPDATE vehicles
             SET active = ${v.active}, updated_at = now()
           WHERE id::text = ${v.id}
       RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active;
        `;
        if (!rows.length) return res.status(404).json({ ok:false, error:'not_found' });
        return res.status(200).json({ ok:true, vehicle: rows[0] });
      }

      // 2) Update por id (edición completa)
      if (v.id) {
        if (!requireFields(v)) return res.status(400).json({ ok:false, error:'missing_or_invalid_fields' });

        const rows = await sql`
          UPDATE vehicles
             SET plate = ${v.plate},
                 driver_name = ${v.driver_name},
                 kind = ${v.kind},
                 year = ${v.year},
                 model = ${v.model},
                 active = COALESCE(${v.active}, active),
                 updated_at = now()
           WHERE id::text = ${v.id}
       RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active;
        `;
        if (!rows.length) return res.status(404).json({ ok:false, error:'not_found' });
        return res.status(200).json({ ok:true, vehicle: rows[0] });
      }

      // 3) Insert / Upsert por placa (case-insensitive)
      if (!requireFields(v)) return res.status(400).json({ ok:false, error:'missing_or_invalid_fields' });

      // ¿existe por plate?
      const existing = await sql`
        SELECT id FROM vehicles WHERE UPPER(plate) = UPPER(${v.plate}) LIMIT 1;
      `;

      if (existing.length) {
        const id = existing[0].id;
        const rows = await sql`
          UPDATE vehicles
             SET driver_name = ${v.driver_name},
                 kind = ${v.kind},
                 year = ${v.year},
                 model = ${v.model},
                 active = COALESCE(${v.active}, active, true),
                 updated_at = now()
           WHERE id = ${id}
       RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active;
        `;
        return res.status(200).json({ ok:true, vehicle: rows[0] });
      } else {
        const rows = await sql`
          INSERT INTO vehicles (plate, driver_name, kind, year, model, active)
          VALUES (${v.plate}, ${v.driver_name}, ${v.kind}, ${v.year}, ${v.model}, ${v.active ?? true})
       RETURNING id::text AS id, plate, driver_name, UPPER(kind) AS kind, year, model, active;
        `;
        return res.status(201).json({ ok:true, vehicle: rows[0] });
      }
    }

    // ===== DELETE por id =====
    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) return res.status(400).json({ ok:false, error:'missing_id' });

      // Neon no da rowCount; usamos RETURNING
      const rows = await sql`DELETE FROM vehicles WHERE id::text = ${id} RETURNING id;`;
      if (!rows.length) return res.status(404).json({ ok:false, error:'not_found' });
      return res.status(200).json({ ok:true });
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (e) {
    console.error('[/api/admin/vehicles] error:', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
}

// OWNER / ADMIN / DISPATCHER
export default requireAuth(['OWNER','ADMIN','DISPATCHER'])(handler);

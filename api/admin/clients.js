// /api/admin/clients.js
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '../_lib/guard.js';

const RATINGS = new Set(['good', 'watch', 'restricted']);

function norm(body = {}) {
  const name  = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const home  = String(body.home_address ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const rRaw  = String(body.internal_rating ?? 'good').trim().toLowerCase();
  const rating = RATINGS.has(rRaw) ? rRaw : 'good';

  return {
    id: body.id ? String(body.id) : null,
    name,
    email: email || null,
    phone: phone || null,
    home_address: home || null,
    internal_rating: rating,
    notes: notes || null,
  };
}

async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    // ===== GET (lista simple; admite ?q= búsqueda básica) =====
    if (req.method === 'GET') {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      let rows;
      if (q) {
        rows = await sql`
          SELECT id::text AS id, name, email, phone, home_address, internal_rating, notes, created_at
            FROM clients
           WHERE lower(name)  LIKE ${'%' + q + '%'}
              OR lower(email) LIKE ${'%' + q + '%'}
              OR phone        LIKE ${'%' + q + '%'}
           ORDER BY created_at DESC
           LIMIT 500;
        `;
      } else {
        rows = await sql`
          SELECT id::text AS id, name, email, phone, home_address, internal_rating, notes, created_at
            FROM clients
           ORDER BY created_at DESC
           LIMIT 500;
        `;
      }
      return res.status(200).json({ ok: true, clients: rows });
    }

    // ===== POST (crear / actualizar / upsert por email) =====
    if (req.method === 'POST') {
      const b = norm(req.body || {});
      if (!b.name) return res.status(400).json({ ok:false, error:'missing_name' });

      // UPDATE por id
      if (b.id) {
        const rows = await sql`
          UPDATE clients
             SET name = ${b.name},
                 email = ${b.email},
                 phone = ${b.phone},
                 home_address = ${b.home_address},
                 internal_rating = ${b.internal_rating},
                 notes = ${b.notes},
                 updated_at = now()
           WHERE id::text = ${b.id}
       RETURNING id::text AS id, name, email, phone, home_address, internal_rating, notes, created_at;
        `;
        if (!rows.length) return res.status(404).json({ ok:false, error:'not_found' });
        return res.status(200).json({ ok:true, client: rows[0] });
      }

      // INSERT (upsert por email si viene email)
      if (b.email) {
        const rows = await sql`
          INSERT INTO clients (name, email, phone, home_address, internal_rating, notes)
          VALUES (${b.name}, ${b.email}, ${b.phone}, ${b.home_address}, ${b.internal_rating}, ${b.notes})
          ON CONFLICT (email) DO UPDATE
             SET name = EXCLUDED.name,
                 phone = EXCLUDED.phone,
                 home_address = EXCLUDED.home_address,
                 internal_rating = EXCLUDED.internal_rating,
                 notes = EXCLUDED.notes,
                 updated_at = now()
       RETURNING id::text AS id, name, email, phone, home_address, internal_rating, notes, created_at;
        `;
        return res.status(200).json({ ok:true, client: rows[0] });
      }

      // INSERT sin email
      const rows = await sql`
        INSERT INTO clients (name, email, phone, home_address, internal_rating, notes)
        VALUES (${b.name}, ${null}, ${b.phone}, ${b.home_address}, ${b.internal_rating}, ${b.notes})
        RETURNING id::text AS id, name, email, phone, home_address, internal_rating, notes, created_at;
      `;
      return res.status(201).json({ ok:true, client: rows[0] });
    }

    // ===== DELETE por id =====
    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) return res.status(400).json({ ok:false, error:'missing_id' });

      const r = await sql`DELETE FROM clients WHERE id::text = ${id};`;
      if (!r.count) return res.status(404).json({ ok:false, error:'not_found' });
      return res.status(200).json({ ok:true });
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (e) {
    console.error('[/api/admin/clients] error:', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
}

// Solo OWNER / ADMIN pueden gestionar clientes
export default requireAuth(['OWNER','ADMIN'])(handler);

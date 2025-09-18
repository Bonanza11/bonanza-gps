// /api/admin/blocks.js
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '../_lib/guard.js';

// Aceptamos solo estos tipos
const KINDS = new Set(['block', 'slc_exception']);

function norm(body = {}) {
  const kindRaw = String(body.kind || 'block').toLowerCase();
  const kind = KINDS.has(kindRaw) ? kindRaw : 'block';

  const starts_on = body.starts_on ? String(body.starts_on).slice(0, 10) : null; // YYYY-MM-DD
  const ends_on   = body.ends_on   ? String(body.ends_on).slice(0, 10)   : null;

  return {
    id: body.id ? String(body.id) : null,
    kind,
    starts_on,
    ends_on,
    note: (body.note || '').trim() || null,
    active: Boolean(body.active),
  };
}

function validISO(dateStr) {
  // formato YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '');
}

async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id::text,
               lower(kind) AS kind,
               starts_on,
               ends_on,
               note,
               active,
               created_at
          FROM blocks
         ORDER BY starts_on DESC, id DESC
         LIMIT 500;
      `;
      return res.status(200).json({ ok: true, blocks: rows });
    }

    if (req.method === 'POST') {
      const b = norm(req.body || {});
      if (!b.starts_on || !b.ends_on)
        return res.status(400).json({ ok:false, error:'missing_dates' });

      if (!validISO(b.starts_on) || !validISO(b.ends_on))
        return res.status(400).json({ ok:false, error:'invalid_date_format', hint:'YYYY-MM-DD' });

      if (b.starts_on > b.ends_on)
        return res.status(400).json({ ok:false, error:'starts_after_ends' });

      // UPDATE
      if (b.id) {
        const rows = await sql`
          UPDATE blocks
             SET kind      = ${b.kind},
                 starts_on = ${b.starts_on},
                 ends_on   = ${b.ends_on},
                 note      = ${b.note},
                 active    = ${b.active},
                 updated_at= now()
           WHERE id::text  = ${b.id}
       RETURNING id::text, lower(kind) AS kind, starts_on, ends_on, note, active, created_at;
        `;
        if (!rows.length) return res.status(404).json({ ok:false, error:'not_found' });
        return res.status(200).json({ ok:true, block: rows[0] });
      }

      // INSERT
      const rows = await sql`
        INSERT INTO blocks (kind, starts_on, ends_on, note, active)
        VALUES (${b.kind}, ${b.starts_on}, ${b.ends_on}, ${b.note}, ${b.active})
        RETURNING id::text, lower(kind) AS kind, starts_on, ends_on, note, active, created_at;
      `;
      return res.status(201).json({ ok:true, block: rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id || '').toString();
      if (!id) return res.status(400).json({ ok:false, error:'missing_id' });

      const r = await sql`DELETE FROM blocks WHERE id::text = ${id};`;
      if (!r.count) return res.status(404).json({ ok:false, error:'not_found' });
      return res.status(200).json({ ok:true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (e) {
    console.error('[/api/admin/blocks] error:', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
}

// 👇 Solo OWNER / ADMIN pueden gestionar bloqueos
export default requireAuth(['OWNER','ADMIN'])(handler);

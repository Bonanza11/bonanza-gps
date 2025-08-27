// /api/admin/clients.js
import { pool } from "../_db.js";

function okKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

async function q(text, params=[]) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export default async function handler(req, res){
  try{
    if (!okKey(req)) return res.status(401).json({ ok:false, error:'Unauthorized' });

    if (req.method === 'GET'){
      const rows = await q(`
        SELECT id::text, name, email, phone, home_address, internal_rating, notes, created_at
        FROM clients
        ORDER BY created_at DESC
        LIMIT 500
      `);
      return res.json({ ok:true, clients: rows });
    }

    if (req.method === 'POST'){
      const { id, name, email, phone, home_address, internal_rating, notes } = req.body || {};
      if (!name) return res.status(400).json({ ok:false, error:'Missing name' });

      if (id){
        const r = await q(`
          UPDATE clients
             SET name=$2, email=$3, phone=$4, home_address=$5, internal_rating=$6, notes=$7
           WHERE id::text=$1
           RETURNING id::text, name, email, phone, home_address, internal_rating, notes, created_at
        `, [String(id), name, email||null, phone||null, home_address||null, internal_rating||'GOOD', notes||null]);
        if (!r.length) return res.status(404).json({ ok:false, error:'Client not found' });
        return res.json({ ok:true, client:r[0] });
      }

      const r = await q(`
        INSERT INTO clients (name,email,phone,home_address,internal_rating,notes)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (email) DO UPDATE
          SET name=EXCLUDED.name, phone=EXCLUDED.phone, home_address=EXCLUDED.home_address,
              internal_rating=EXCLUDED.internal_rating, notes=EXCLUDED.notes
        RETURNING id::text, name, email, phone, home_address, internal_rating, notes, created_at
      `, [name, email||null, phone||null, home_address||null, internal_rating||'GOOD', notes||null]);
      return res.json({ ok:true, client:r[0] });
    }

    if (req.method === 'DELETE'){
      const id = (req.query.id||'').toString();
      if (!id) return res.status(400).json({ ok:false, error:'Missing id' });
      const r = await q(`DELETE FROM clients WHERE id::text=$1 RETURNING 1`, [id]);
      if (!r.length) return res.status(404).json({ ok:false, error:'Client not found' });
      return res.json({ ok:true });
    }

    res.setHeader('Allow','GET,POST,DELETE');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }catch(e){
    console.error('[/api/admin/clients] error:', e);
    return res.status(500).json({ ok:false, error:e.message||'Internal error' });
  }
}

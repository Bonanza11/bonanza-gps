// /api/admin/blocks.js
import { pool } from "../_db.js";

function okKey(req){
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const env = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(env);
}

function norm(b={}){
  const kind = String(b.kind||'block').toLowerCase();
  return {
    id: b.id ? String(b.id) : null,
    kind: (kind==='slc_exception' ? 'slc_exception' : 'block'),
    starts_on: b.starts_on ? String(b.starts_on) : null,
    ends_on: b.ends_on ? String(b.ends_on) : null,
    note: (b.note||'').trim() || null,
    active: !!b.active
  };
}

export default async function handler(req,res){
  try{
    if(!okKey(req)) return res.status(401).json({ok:false, error:'Unauthorized'});

    if (req.method === 'GET'){
      const { rows } = await pool.query(
        `select id::text, lower(kind) as kind, starts_on, ends_on, note, active, created_at
           from blocks
          order by starts_on desc, id desc
          limit 500`
      );
      return res.json({ ok:true, blocks: rows });
    }

    if (req.method === 'POST'){
      const b = norm(req.body||{});
      if (!b.starts_on || !b.ends_on)
        return res.status(400).json({ ok:false, error:'Missing dates' });

      // update
      if (b.id){
        const { rows } = await pool.query(
          `update blocks
              set kind=$2, starts_on=$3, ends_on=$4, note=$5, active=$6
            where id::text=$1
          returning id::text, lower(kind) as kind, starts_on, ends_on, note, active, created_at`,
          [b.id, b.kind, b.starts_on, b.ends_on, b.note, b.active]
        );
        if(!rows.length) return res.status(404).json({ ok:false, error:'Not found' });
        return res.json({ ok:true, block: rows[0] });
      }

      // insert
      const { rows } = await pool.query(
        `insert into blocks (kind, starts_on, ends_on, note, active)
         values ($1,$2,$3,$4,$5)
         returning id::text, lower(kind) as kind, starts_on, ends_on, note, active, created_at`,
        [b.kind, b.starts_on, b.ends_on, b.note, b.active]
      );
      return res.json({ ok:true, block: rows[0] });
    }

    if (req.method === 'DELETE'){
      const id = (req.query.id||'').toString();
      if(!id) return res.status(400).json({ ok:false, error:'Missing id' });
      const r = await pool.query(`delete from blocks where id::text=$1`, [id]);
      if (!r.rowCount) return res.status(404).json({ ok:false, error:'Not found' });
      return res.json({ ok:true });
    }

    res.setHeader('Allow','GET,POST,DELETE');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }catch(e){
    console.error('[/api/admin/blocks] error:', e);
    return res.status(500).json({ ok:false, error:e.message||'Internal error' });
  }
}

// /api/admin/clients.js
import { pool, query } from "../_db.js";

// --- Auth ---
function checkKey(req) {
  const hdr = req.headers["x-admin-key"] || req.headers["X-Admin-Key"];
  const envKey = process.env.ADMIN_KEY || "supersecreto123";
  return hdr && String(hdr) === String(envKey);
}

// Normaliza body
function norm(body = {}) {
  return {
    id: body.id ? String(body.id) : null,
    name: (body.name ?? "").toString().trim(),
    email: (body.email ?? "").toString().trim().toLowerCase() || null,
    phone: (body.phone ?? "").toString().trim() || null,
    home_address: (body.home_address ?? "").toString().trim() || null,
    internal_rating: (body.internal_rating ?? "good").toString().trim().toLowerCase(),
    notes: (body.notes ?? "").toString().trim() || null,
  };
}

const SELECT_ONE = `
  select
    id::text as id,
    name, email, phone, home_address,
    internal_rating, notes, created_at
  from clients
  where id::text = $1
`;

/**
 * GET    -> lista de clientes
 * POST   -> crea o actualiza (por id; o UPSERT por email si no hay id)
 * DELETE -> elimina por id
 */
export default async function handler(req, res) {
  try {
    if (!checkKey(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

    // ===== GET: list =====
    if (req.method === "GET") {
      const rows = await query(
        `select
           id::text as id, name, email, phone, home_address,
           internal_rating, notes, created_at
         from clients
         order by created_at desc
         limit 500`
      );
      return res.json({ ok: true, clients: rows });
    }

    // ===== POST: create / update / upsert-by-email =====
    if (req.method === "POST") {
      const b = norm(req.body || {});
      if (!b.name) return res.status(400).json({ ok: false, error: "Missing name" });

      // 1) update por id
      if (b.id) {
        const { rows } = await pool.query(
          `update clients
              set name=$2,
                  email=$3,
                  phone=$4,
                  home_address=$5,
                  internal_rating=$6,
                  notes=$7
            where id::text=$1
            returning id::text as id, name, email, phone, home_address, internal_rating, notes, created_at`,
          [b.id, b.name, b.email, b.phone, b.home_address, b.internal_rating, b.notes]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Client not found" });
        return res.json({ ok: true, client: rows[0] });
      }

      // 2) crear / upsert por email (si hay email)
      if (b.email) {
        const { rows } = await pool.query(
          `insert into clients (name, email, phone, home_address, internal_rating, notes)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (email) do update
             set name=excluded.name,
                 phone=excluded.phone,
                 home_address=excluded.home_address,
                 internal_rating=excluded.internal_rating,
                 notes=excluded.notes
           returning id::text as id, name, email, phone, home_address, internal_rating, notes, created_at`,
          [b.name, b.email, b.phone, b.home_address, b.internal_rating, b.notes]
        );
        return res.json({ ok: true, client: rows[0] });
      }

      // 3) crear sin email (permitido)
      const { rows } = await pool.query(
        `insert into clients (name, email, phone, home_address, internal_rating, notes)
         values ($1,$2,$3,$4,$5,$6)
         returning id::text as id, name, email, phone, home_address, internal_rating, notes, created_at`,
        [b.name, null, b.phone, b.home_address, b.internal_rating, b.notes]
      );
      return res.json({ ok: true, client: rows[0] });
    }

    // ===== DELETE: by id =====
    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`delete from clients where id::text = $1`, [id]);
      if (!rowCount) return res.status(404).json({ ok: false, error: "Client not found" });
      return res.json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  } catch (e) {
    console.error("[/api/admin/clients] error:", e);
    return res.status(500).json({ ok: false, error: e.message || "Internal error" });
  }
}

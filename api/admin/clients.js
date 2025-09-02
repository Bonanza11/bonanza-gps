// /api/admin/clients.js
import { pool, query } from "../_db.js";

// --- Auth con ADMIN_KEY ---
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
    email: ((body.email ?? "").toString().trim() || null)?.toLowerCase() || null,
    phone: (body.phone ?? "").toString().trim() || null,
    home_address: (body.home_address ?? "").toString().trim() || null,
    internal_rating: (body.internal_rating ?? "good").toString().trim().toLowerCase(),
    notes: (body.notes ?? "").toString().trim() || null,
  };
}

export default async function handler(req, res) {
  try {
    if (!checkKey(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

    if (req.method === "GET") {
      const rows = await query(`
        SELECT id::text as id, name, email, phone, home_address,
               internal_rating, notes, created_at
        FROM clients
        ORDER BY created_at DESC
        LIMIT 500
      `);
      return res.json({ ok: true, clients: rows });
    }

    if (req.method === "POST") {
      const b = norm(req.body || {});
      if (!b.name) return res.status(400).json({ ok: false, error: "Missing name" });

      if (b.id) {
        const { rows } = await pool.query(
          `UPDATE clients
              SET name=$2, email=$3, phone=$4, home_address=$5,
                  internal_rating=$6, notes=$7
            WHERE id::text=$1
         RETURNING id::text, name, email, phone, home_address, internal_rating, notes, created_at`,
          [b.id, b.name, b.email, b.phone, b.home_address, b.internal_rating, b.notes]
        );
        if (!rows.length) return res.status(404).json({ ok: false, error: "Client not found" });
        return res.json({ ok: true, client: rows[0] });
      }

      if (b.email) {
        const { rows } = await pool.query(
          `INSERT INTO clients (name, email, phone, home_address, internal_rating, notes)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (email) DO UPDATE
             SET name=EXCLUDED.name,
                 phone=EXCLUDED.phone,
                 home_address=EXCLUDED.home_address,
                 internal_rating=EXCLUDED.internal_rating,
                 notes=EXCLUDED.notes
           RETURNING id::text, name, email, phone, home_address, internal_rating, notes, created_at`,
          [b.name, b.email, b.phone, b.home_address, b.internal_rating, b.notes]
        );
        return res.json({ ok: true, client: rows[0] });
      }

      const { rows } = await pool.query(
        `INSERT INTO clients (name, email, phone, home_address, internal_rating, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id::text, name, email, phone, home_address, internal_rating, notes, created_at`,
        [b.name, null, b.phone, b.home_address, b.internal_rating, b.notes]
      );
      return res.json({ ok: true, client: rows[0] });
    }

    if (req.method === "DELETE") {
      const id = (req.query.id || "").toString();
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { rowCount } = await pool.query(`DELETE FROM clients WHERE id::text=$1`, [id]);
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

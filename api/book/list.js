// /api/book/list.js
import { neon } from "@neondatabase/serverless";
import { requireAuth } from "../_lib/guard.js";

function parseLimit(v) {
  const n = Number.parseInt(String(v ?? "20"), 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(n, 100)) : 20;
}

// cursor = "<isoCreatedAt>|<id>"
function parseCursor(c) {
  if (!c) return null;
  const [iso, idStr] = String(c).split("|");
  const ts = new Date(iso);
  const id = Number.parseInt(idStr, 10);
  if (!iso || Number.isNaN(ts.getTime()) || Number.isNaN(id)) return null;
  return { ts, id };
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const sql   = neon(process.env.DATABASE_URL);
    const limit = parseLimit(req.query.limit);

    const q     = (req.query.q || "").toString().trim();
    const from  = (req.query.from || "").toString().trim(); // YYYY-MM-DD
    const to    = (req.query.to || "").toString().trim();   // YYYY-MM-DD
    const cur   = parseCursor(req.query.cursor);

    // WHERE dinámico
    const where = [];
    const params = [];

    if (q) {
      // busca por CN (case-insensitive) o por nombre
      where.push(`(upper(confirmation_number) = upper($${params.length + 1}) OR full_name ILIKE $${params.length + 2})`);
      params.push(q, `%${q}%`);
    }

    if (from) {
      where.push(`date_iso >= $${params.length + 1}`);
      params.push(from);
    }
    if (to) {
      where.push(`date_iso <= $${params.length + 1}`);
      params.push(to);
    }

    if (cur) {
      // keyset pagination: created_at < cursor.ts  OR (== y id < cursor.id)
      where.push(`(created_at < $${params.length + 1} OR (created_at = $${params.length + 1} AND id < $${params.length + 2}))`);
      params.push(cur.ts.toISOString(), cur.id);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await sql`
      SELECT id, confirmation_number, full_name, pickup, dropoff,
             date_iso, time_hhmm, status, created_at
        FROM bookings
        ${sql.unsafe(whereSql, params)}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}  -- pedimos uno extra para saber si hay más
    `;

    let next_cursor = null;
    let data = rows;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      next_cursor = `${last.created_at.toISOString?.() ?? new Date(last.created_at).toISOString()}|${last.id}`;
      data = rows.slice(0, limit);
    }

    return res.status(200).json({ ok: true, bookings: data, next_cursor });
  } catch (err) {
    console.error("book/list error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

// Protegido: OWNER/ADMIN/DISPATCHER
export default requireAuth(["OWNER", "ADMIN", "DISPATCHER"])(handler);

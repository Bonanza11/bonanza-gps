// /api/book/list.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const rows = await sql`
      select id, confirmation_number, full_name, pickup, dropoff,
             date_iso, time_hhmm, status, created_at
      from bookings
      order by created_at desc
      limit ${limit}
    `;
    return res.status(200).json({ ok:true, bookings: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}

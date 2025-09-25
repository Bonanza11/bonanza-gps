// /api/reservations/index.js
// GET: lista (admin) | POST: crea (público) | PATCH: asigna/desasigna driver (admin)
import { query } from "../_db.js";
import { requireAuth } from "../_lib/guard.js";

export const config = { runtime: "nodejs" };

// ---- helpers ----
const strOrNull = v => (v === undefined || v === null) ? null : String(v).trim() || null;
const isISO = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));
const VEHICLES = new Set(["SUV","VAN"]); // <-- ajusta a tus tipos reales

export default async function handler(req, res) {
  try {
    // --- Rutas protegidas: solo GET y PATCH ---
    if (req.method !== "POST") {
      // OWNER, ADMIN, DISPATCHER pueden listar/asignar
      await requireAuth(["OWNER","ADMIN","DISPATCHER"])(async () => {})(req, res);
      // ^ truco para reutilizar tu middleware como verificación rápida
      // Si tu requireAuth devuelve usuario, quizá quieras leer req.user aquí
    }

    // ---------- GET (ADMIN) ----------
    if (req.method === "GET") {
      const {
        status,                // optional: PENDING/ASSIGNED/DONE/...
        from,                  // ISO desde pickup_time
        to,                    // ISO hasta pickup_time
        search,                // por nombre/teléfono/email
        page = "1",
        pageSize = "25"
      } = req.query || {};

      const p = Math.max(1, parseInt(page, 10) || 1);
      const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));

      // build where dinámico
      const where = [];
      const vals = [];
      let i = 1;

      if (status) { where.push(`r.status = $${i++}`); vals.push(String(status).toUpperCase()); }
      if (from && isISO(from)) { where.push(`r.pickup_time >= $${i++}`); vals.push(from); }
      if (to && isISO(to)) { where.push(`r.pickup_time < $${i++}`); vals.push(to); }
      if (search) {
        where.push(`(r.customer_name ILIKE $${i} OR r.email ILIKE $${i} OR r.phone ILIKE $${i})`);
        vals.push(`%${String(search).trim()}%`); i++;
      }

      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const listSQL = `
        SELECT
          r.id,
          r.customer_name,
          r.email,
          r.phone,
          r.pickup_location,
          r.dropoff_location,
          r.pickup_time,
          r.vehicle_type,
          lower(r.status) AS status,
          r.vehicle_id,
          r.driver_name,
          r.notes,
          r.assigned_at, r.started_at, r.arrived_at, r.done_at, r.updated_at,
          d.name  AS driver,
          v.plate AS vehicle_plate,
          CASE
            WHEN v.id IS NULL THEN NULL
            ELSE v.plate::text || ' — ' || v.kind::text || ' — ' || COALESCE(v.driver_name,'')::text
          END AS vehicle_label
        FROM reservations r
        LEFT JOIN vehicles v ON v.id = r.vehicle_id
        LEFT JOIN drivers  d ON d.id = r.driver_id
        ${whereSQL}
        ORDER BY r.pickup_time DESC
        LIMIT ${ps} OFFSET ${(p-1)*ps}
      `;

      const countSQL = `
        SELECT COUNT(*)::int AS total
        FROM reservations r
        ${whereSQL}
      `;

      const [{ rows }, countRes] = await Promise.all([
        query(listSQL, vals),
        query(countSQL, vals)
      ]);

      const total = countRes.rows?.[0]?.total ?? 0;
      return res.status(200).json({ ok: true, data: rows || [], page: p, pageSize: ps, total });
    }

    // ---------- POST (PÚBLICO) ----------
    if (req.method === "POST") {
      let {
        customer_name,
        email,
        phone,
        pickup_location,
        dropoff_location,
        pickup_time,
        vehicle_type = "SUV",
        driver_name = null,
        notes = null
      } = req.body || {};

      // sanitiza
      customer_name    = (customer_name || "").toString().trim();
      pickup_location  = (pickup_location || "").toString().trim();
      dropoff_location = (dropoff_location || "").toString().trim();
      vehicle_type     = (vehicle_type || "SUV").toString().trim().toUpperCase();
      email            = strOrNull(email);
      phone            = strOrNull(phone);
      driver_name      = strOrNull(driver_name);
      notes            = strOrNull(notes);

      if (!customer_name || !pickup_location || !dropoff_location || !pickup_time) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }
      if (!isISO(pickup_time)) {
        return res.status(400).json({ ok:false, error:"invalid_pickup_time_iso" });
      }
      if (!VEHICLES.has(vehicle_type)) {
        return res.status(400).json({ ok:false, error:"invalid_vehicle_type" });
      }

      const insertSQL = `
        INSERT INTO reservations
          (customer_name, email, phone,
           pickup_location, dropoff_location, pickup_time,
           vehicle_type, status, driver_name, notes, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9, now())
        RETURNING *
      `;
      const { rows } = await query(insertSQL, [
        customer_name, email, phone,
        pickup_location, dropoff_location, pickup_time,
        vehicle_type, driver_name, notes
      ]);

      return res.status(201).json({ ok: true, data: rows?.[0] ?? null });
    }

    // ---------- PATCH (ADMIN) ----------
    // body: { id, driver_id|null, driver_name? }  -> assign/unassign driver
    if (req.method === "PATCH") {
      let { id, driver_id = null, driver_name = undefined } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
      if (driver_name !== undefined) driver_name = strOrNull(driver_name);

      const updateSQL = `
        UPDATE reservations
           SET driver_id   = $2,
               driver_name = COALESCE($3, driver_name),
               status      = CASE WHEN $2 IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END,
               assigned_at = CASE WHEN $2 IS NULL THEN NULL       ELSE now()    END,
               updated_at  = now()
         WHERE id = $1
         RETURNING *
      `;
      const { rows } = await query(updateSQL, [id, driver_id, driver_name]);

      if (!rows?.[0]) return res.status(404).json({ ok:false, error:"not_found" });
      return res.status(200).json({ ok: true, data: rows[0] });
    }

    // ---------- Método no permitido ----------
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  } catch (err) {
    console.error("[/api/reservations] ", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      detail: String(err?.message || err)
    });
  }
}

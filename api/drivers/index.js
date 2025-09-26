// /api/drivers/index.js
// GET: lista | POST: crea | PATCH: actualiza
import { q } from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

const ADMIN = process.env.ADMIN_KEY || 'supersecreto123';

// Helpers
const toNum = (v) =>
  v === '' || v === null || v === undefined ? null : Number(v);
const toStrOrUndef = (v) =>
  v === undefined ? undefined : v === '' || v === null ? null : String(v);
const toBoolOrUndef = (v) =>
  v === undefined ? undefined : !!v;

function isAuthorized(req) {
  const hdr = req.headers['x-admin-key'] || req.headers['X-Admin-Key'];
  return String(hdr || '') === String(ADMIN);
}

export default async function handler(req, res) {
  try {
    // --- Auth ---
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    // ---------- GET ----------
    if (req.method === 'GET') {
      const { rows } = await q(
        `select
           id::text as id,
           name, email, phone, pay_mode,
           hourly_rate, per_ride_rate, revenue_share,
           notify_email, notify_sms, created_at
         from drivers
         order by created_at desc`
      );
      return res.json({ ok: true, drivers: Array.isArray(rows) ? rows : [] });
    }

    // ---------- POST ----------
    if (req.method === 'POST') {
      let {
        name,
        email = null,
        phone = null,
        pay_mode = 'per_ride', // 'associate' | 'hourly' | 'per_ride'
        hourly_rate = null,
        per_ride_rate = null,
        revenue_share = null,  // 0.0 a 1.0 si es associate
        notify_email = true,
        notify_sms = false
      } = req.body || {};

      if (!name) {
        return res.status(400).json({ ok: false, error: 'missing_name' });
      }

      name = String(name).trim();
      email = toStrOrUndef(email);
      phone = toStrOrUndef(phone);
      pay_mode = String(pay_mode || 'per_ride').toLowerCase();
      hourly_rate = toNum(hourly_rate);
      per_ride_rate = toNum(per_ride_rate);
      revenue_share = toNum(revenue_share);
      notify_email = !!notify_email;
      notify_sms = !!notify_sms;

      const { rows } = await q(
        `insert into drivers
           (name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning
           id::text as id, name, email, phone, pay_mode,
           hourly_rate, per_ride_rate, revenue_share,
           notify_email, notify_sms, created_at`,
        [name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
      );

      return res.status(201).json({ ok: true, driver: rows?.[0] ?? null });
    }

    // ---------- PATCH ----------
    if (req.method === 'PATCH') {
      let {
        id,
        name = undefined,
        email = undefined,
        phone = undefined,
        pay_mode = undefined,
        hourly_rate = undefined,
        per_ride_rate = undefined,
        revenue_share = undefined,
        notify_email = undefined,
        notify_sms = undefined
      } = req.body || {};

      if (!id) {
        return res.status(400).json({ ok: false, error: 'missing_id' });
      }

      // Normalizar solo si vienen definidos (undefined = no tocar)
      if (name !== undefined) name = String(name).trim();
      if (email !== undefined) email = toStrOrUndef(email);
      if (phone !== undefined) phone = toStrOrUndef(phone);
      if (pay_mode !== undefined) pay_mode = String(pay_mode).toLowerCase();
      if (hourly_rate !== undefined) hourly_rate = toNum(hourly_rate);
      if (per_ride_rate !== undefined) per_ride_rate = toNum(per_ride_rate);
      if (revenue_share !== undefined) revenue_share = toNum(revenue_share);
      if (notify_email !== undefined) notify_email = toBoolOrUndef(notify_email);
      if (notify_sms !== undefined) notify_sms = toBoolOrUndef(notify_sms);

      const { rows } = await q(
        `update drivers set
           name          = coalesce($2,  name),
           email         = coalesce($3,  email),
           phone         = coalesce($4,  phone),
           pay_mode      = coalesce($5,  pay_mode),
           hourly_rate   = coalesce($6,  hourly_rate),
           per_ride_rate = coalesce($7,  per_ride_rate),
           revenue_share = coalesce($8,  revenue_share),
           notify_email  = coalesce($9,  notify_email),
           notify_sms    = coalesce($10, notify_sms),
           updated_at    = now()
         where id = $1::uuid
         returning
           id::text as id, name, email, phone, pay_mode,
           hourly_rate, per_ride_rate, revenue_share,
           notify_email, notify_sms, created_at, updated_at`,
        [id, name, email, phone, pay_mode, hourly_rate, per_ride_rate, revenue_share, notify_email, notify_sms]
      );

      if (!rows?.length) {
        return res.status(404).json({ ok: false, error: 'driver_not_found' });
      }
      return res.json({ ok: true, driver: rows[0] });
    }

    // ---------- Método no permitido ----------
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  } catch (err) {
    console.error('[/api/drivers] ', err);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(err?.message || err) });
  }
}

// api/_lib/db.js
import { Pool } from 'pg';

let _pool;

export function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  _pool.on('error', (e) => console.error('PG pool error', e));
  return _pool;
}

export async function q(text, params = []) {
  const pool = getPool();
  return await pool.query(text, params);
}

// api/_lib/db.js
import { Pool } from 'pg';

let _pool;

/**
 * Crea un Pool singleton para entornos serverless.
 */
export function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon/managed Postgres: SSL recomendado
    ssl: { rejectUnauthorized: false },
    // Ajustes suaves para lambdas
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  _pool.on('error', (e) => {
    console.error('PG pool error:', e);
  });

  return _pool;
}

/**
 * Helper simple para queries.
 * @param {string} text SQL con $1, $2...
 * @param {any[]} params parámetros opcionales
 */
export async function q(text, params = []) {
  const pool = getPool();
  const res = await pool.query(text, params);
  return res;
}

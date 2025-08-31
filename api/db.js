// /api/_db.js
import { Pool } from "pg";

const CONN_STR =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.PGURL ||
  "";

const globalForPg = globalThis.__pgPool ?? { pool: null };

if (!globalForPg.pool) {
  globalForPg.pool = new Pool({
    connectionString: CONN_STR,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });
  globalForPg.pool.on("error", (err) => {
    console.error("[DB] Pool error:", err);
  });
}

export const pool = globalForPg.pool;
if (!globalThis.__pgPool) globalThis.__pgPool = { pool };

// Helpers
export async function query(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}
export async function dbPing() {
  const rows = await query("select 1 as ok");
  return rows?.[0]?.ok === 1;
}

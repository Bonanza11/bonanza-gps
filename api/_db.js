// /api/_db.js
import { Pool } from "pg";

const CONN_STR =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.PGURL ||
  "";

if (!CONN_STR) {
  throw new Error("[DB] Missing DATABASE_URL/POSTGRES_URL env var");
}

// cache del pool entre invocaciones (serverless)
const g = globalThis;
g.__pgPool ??= new Pool({
  connectionString: CONN_STR,
  ssl: { rejectUnauthorized: false }, // Neon/most managed PG need SSL
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

g.__pgPool.on?.("error", (err) => {
  console.error("[DB] Pool error:", err);
});

export const pool = g.__pgPool;

export async function query(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function dbPing() {
  const rows = await query("select 1 as ok");
  return rows?.[0]?.ok === 1;
}

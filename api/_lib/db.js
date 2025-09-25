
// /api/db.js
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

// Reusar pool entre invocaciones serverless
const g = globalThis;
g.__pgPool ??= new Pool({
  connectionString: CONN_STR,
  ssl: { rejectUnauthorized: false }, // Neon/managed PG usualmente requieren TLS
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  application_name: process.env.APP_NAME || "bonanza-gps-api",
});

// Set de timeouts por sesión al tomar un cliente del pool
async function _prepSession(client) {
  // statement_timeout: mata queries largas
  // idle_in_transaction_session_timeout: mata sesiones atascadas en transacciones
  await client.query(`
    SET statement_timeout TO ${Number(process.env.PG_STMT_TIMEOUT_MS || 15000)};
    SET idle_in_transaction_session_timeout TO ${Number(process.env.PG_IDLE_TX_TIMEOUT_MS || 15000)};
  `);
}

g.__pgPool.on?.("error", (err) => {
  console.error("[DB] Pool error:", err);
});

export const pool = g.__pgPool;

/** Ejecuta una consulta simple y retorna rows */
export async function query(text, params = []) {
  const client = await pool.connect();
  try {
    await _prepSession(client);
    const { rows } = await client.query(text, params);
    return rows;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[DB] query error:", err?.message, "\nSQL:", text, "\nParams:", params);
    } else {
      console.error("[DB] query error:", err?.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Ejecuta lógica con un client dedicado (útil para batchs sin transacción) */
export async function withClient(fn) {
  const client = await pool.connect();
  try {
    await _prepSession(client);
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Transacción con BEGIN/COMMIT/ROLLBACK */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await _prepSession(client);
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/** Ping sencillo para healthchecks */
export async function dbPing() {
  const rows = await query("select 1 as ok");
  return rows?.[0]?.ok === 1;
}

/** (Opcional) Cerrar pool en scripts locales (no en Vercel). */
export async function closePool() {
  await pool.end();
}

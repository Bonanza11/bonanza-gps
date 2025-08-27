// /api/_db.js
// Pool PostgreSQL para entornos serverless (Vercel) con Neon
import { Pool } from "pg";

/**
 * Tomamos la URL de conexión desde varias posibles env vars
 * (la principal es DATABASE_URL).
 */
const CONN_STR =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.PGURL ||
  "";

// Reutiliza el pool entre invocaciones (muy importante en serverless)
const globalForPg = globalThis.__pgPool ?? { pool: null };
if (!globalForPg.pool) {
  if (!CONN_STR) {
    console.warn("[DB] Missing DATABASE_URL/POSTGRES_URL env var.");
  }

  globalForPg.pool = new Pool({
    connectionString: CONN_STR,
    // Neon requiere SSL; rejectUnauthorized:false simplifica certs
    ssl: { rejectUnauthorized: false },
    // Opcionales para serverless
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  globalForPg.pool.on("error", (err) => {
    console.error("[DB] Pool error:", err);
  });
}
export const pool = globalForPg.pool;
if (!globalThis.__pgPool) globalThis.__pgPool = { pool };

/**
 * Helper de consulta con manejo básico de errores.
 * Uso: const rows = await query('SELECT 1 as x');
 */
export async function query(text, params = []) {
  if (!CONN_STR) {
    throw new Error(
      "DATABASE_URL (o POSTGRES_URL) no está configurado en las variables de entorno."
    );
  }
  const res = await pool.query(text, params);
  return res.rows;
}

/**
 * Health-check simple para endpoints /api/ping si lo necesitas.
 */
export async function dbPing() {
  const rows = await query("select 1 as ok");
  return rows?.[0]?.ok === 1;
}

export default pool;

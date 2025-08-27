// /api/_db.js
import { Pool } from "pg";

function connString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

if (!global._pgPool) {
  const url = connString();
  if (!url) throw new Error("DATABASE_URL is missing");
  global._pgPool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Neon
  });
}

const pool = global._pgPool;
export default pool;

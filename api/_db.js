// /api/_db.js
import { Pool } from "pg";

let pool;

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL, // tu Neon DB
    ssl: { rejectUnauthorized: false },
  });
}

export default pool;

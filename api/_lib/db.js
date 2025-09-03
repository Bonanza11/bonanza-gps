// /api/_lib/db.js
import { query as pgQuery } from "../_db.js";

export async function query(text, params = []) {
  return await pgQuery(text, params);
}

// Helpers opcionales
export const toBool = (v) => v === true || v === 1 || v === "1";
export const nowTs = () => new Date().toISOString();

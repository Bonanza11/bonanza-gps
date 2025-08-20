import { Client } from "pg";

export default async function handler(req, res) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const result = await client.query("SELECT NOW()");
    await client.end();

    res.status(200).json({ message: "✅ Conectado a la DB!", time: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

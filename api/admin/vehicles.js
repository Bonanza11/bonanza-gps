// /api/admin/vehicles.js
import pool from "../_db.js"; // usamos el conector centralizado

// clave secreta para admin (ponla en Vercel como variable de entorno ADMIN_KEY)
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme";

export default async function handler(req, res) {
  // validar API Key
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      // listar vehículos
      const { rows } = await pool.query(
        "SELECT id, kind, plate, driver_name, active FROM vehicles ORDER BY plate"
      );
      return res.status(200).json({ ok: true, vehicles: rows });
    }

    if (req.method === "POST") {
      // cambiar estado activo/inactivo
      const { id, active } = req.body;
      if (!id) {
        return res.status(400).json({ error: "Missing vehicle id" });
      }
      await pool.query("UPDATE vehicles SET active=$1 WHERE id=$2", [active, id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("❌ Admin vehicles error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}

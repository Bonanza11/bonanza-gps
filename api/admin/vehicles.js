// /api/admin/vehicles.js
import pool from "../_db.js";

/** Leer body JSON en Vercel Node (sin framework) */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/** Auth por header o query (?key=...) para pruebas rápidas */
function getAdminKey(req) {
  const hdr = req.headers["x-admin-key"];
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get("key");
    return hdr || q || "";
  } catch {
    return hdr || "";
  }
}

const REQ_OK = { "Content-Type": "application/json" };

export default async function handler(req, res) {
  // CORS simple (si lo necesitas desde otros orígenes, ajústalo)
  res.setHeader("Content-Type", "application/json");

  // === Auth ===
  const adminKey = process.env.ADMIN_KEY?.trim();
  const provided = getAdminKey(req);
  if (!adminKey || provided !== adminKey) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  }

  // === Rutas ===
  if (req.method === "GET") {
    try {
      const { rows } = await pool.query(
        `SELECT id, plate, driver_name, kind, year, model, active
           FROM vehicles
          ORDER BY id ASC`
      );
      res.writeHead(200, REQ_OK);
      return res.end(JSON.stringify({ ok: true, vehicles: rows }));
    } catch (e) {
      console.error("DB GET error:", e);
      res.writeHead(500, REQ_OK);
      return res.end(JSON.stringify({ ok: false, error: "Database error" }));
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);

      // 1) toggle rápido (solo cambia active)
      if (body && body.mode === "toggle" && body.id) {
        await pool.query("UPDATE vehicles SET active=$1 WHERE id=$2", [
          !!body.active,
          body.id,
        ]);
        res.writeHead(200, REQ_OK);
        return res.end(JSON.stringify({ ok: true }));
      }

      // 2) upsert completo (create/update)
      const { id, plate, driver_name, kind, year, model, active } = body || {};
      if (!id || !plate || !driver_name || !kind) {
        res.writeHead(400, REQ_OK);
        return res.end(
          JSON.stringify({
            ok: false,
            error: "Missing fields (id, plate, driver_name, kind required).",
          })
        );
      }

      await pool.query(
        `INSERT INTO vehicles (id, plate, driver_name, kind, year, model, active)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
              plate=EXCLUDED.plate,
              driver_name=EXCLUDED.driver_name,
              kind=EXCLUDED.kind,
              year=EXCLUDED.year,
              model=EXCLUDED.model,
              active=EXCLUDED.active`,
        [id, plate, driver_name, kind, year ?? null, model ?? null, !!active]
      );

      res.writeHead(200, REQ_OK);
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("DB POST error:", e);
      res.writeHead(500, REQ_OK);
      return res.end(JSON.stringify({ ok: false, error: "Save failed" }));
    }
  }

  if (req.method === "DELETE") {
    try {
      const body = await readBody(req);
      if (!body?.id) {
        res.writeHead(400, REQ_OK);
        return res.end(JSON.stringify({ ok: false, error: "Missing id" }));
      }
      await pool.query("DELETE FROM vehicles WHERE id=$1", [body.id]);
      res.writeHead(200, REQ_OK);
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("DB DELETE error:", e);
      res.writeHead(500, REQ_OK);
      return res.end(JSON.stringify({ ok: false, error: "Delete failed" }));
    }
  }

  // Métodos no permitidos
  res.writeHead(405, REQ_OK);
  return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
}

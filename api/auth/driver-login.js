// /api/auth/driver-login.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "../_lib/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }

  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ ok:false, error:"missing_fields" });
    }

    const rows = await query(
      "select id, name, email, phone, access_code, active, online from drivers where email=$1 limit 1",
      [email]
    );
    const driver = rows[0];
    if (!driver) return res.status(404).json({ ok:false, error:"not_found" });

    // compara el code (plaintext o hashed con bcrypt)
    let valid = false;
    if (driver.access_code) {
      if (driver.access_code.startsWith("$2a$")) {
        valid = await bcrypt.compare(code, driver.access_code);
      } else {
        valid = driver.access_code === code;
      }
    }
    if (!valid) return res.status(401).json({ ok:false, error:"invalid_code" });

    // genera JWT
    const token = jwt.sign(
      { sub: driver.id, role:"DRIVER" },
      JWT_SECRET,
      { expiresIn:"12h" }
    );

    delete driver.access_code;
    return res.json({ ok:true, token, driver });
  } catch (e) {
    console.error("[driver-login]", e);
    return res.status(500).json({ ok:false, error:"server_error" });
  }
}

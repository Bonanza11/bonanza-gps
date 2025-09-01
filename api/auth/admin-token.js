// /api/auth/admin-token.js  (POST)
import jwt from "jsonwebtoken";
const ADMIN = process.env.ADMIN_KEY || "supersecreto123";
const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end();
  if(req.headers["x-admin-key"] !== ADMIN) {
    return res.status(401).json({ ok:false, error:"unauthorized" });
  }
  const token = jwt.sign(
    { sub: "hq-admin", roles: ["OWNER","ADMIN","DISPATCHER"] },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({ ok:true, token });
}

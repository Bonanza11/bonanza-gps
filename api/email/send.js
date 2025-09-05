// /api/email/send.js
// POST JSON:
// {
//   "to": "cliente@email.com" | ["uno@x.com","dos@y.com"],
//   "subject": "Asunto",
//   "text": "Texto plano opcional",
//   "html": "<b>HTML opcional</b>",
//   "cc": "cc@email.com" | [..],            // opcional
//   "bcc": "oculto@email.com" | [..],       // opcional
//   "reply_to": "responder-a@email.com"     // opcional
// }
//
// Respuesta: { ok:true, id:"<gmail_message_id>" }

import { google } from "googleapis";

// === ENV necesarios (configúralos en Vercel) ===
// GOOGLE_CLIENT_ID
// GOOGLE_CLIENT_SECRET
// GOOGLE_REFRESH_TOKEN
// GMAIL_FROM               -> ej: "reservas@tudominio.com" o tu Gmail
// GMAIL_SENDER_NAME        -> ej: "Bonanza Dispatch" (opcional)
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GMAIL_FROM,
  GMAIL_SENDER_NAME = "Bonanza Dispatch",
} = process.env;

// Utilidad para asegurar body (Vercel normalmente parsea req.body)
async function getJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// Normaliza a lista
function asList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
}

// Construye mensaje RFC822 simple (texto/HTML)
function buildMime({ fromEmail, fromName, to, cc, bcc, subject, text, html, replyTo }) {
  const headers = [];
  headers.push(`From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`);
  headers.push(`To: ${to.join(", ")}`);
  if (cc.length)  headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(", ")}`);
  if (replyTo)    headers.push(`Reply-To: ${replyTo}`);
  headers.push(`Subject: ${subject}`);
  headers.push(`MIME-Version: 1.0`);

  if (html && text) {
    // multipart/alternative
    const boundary = "mime_boundary_" + Math.random().toString(36).slice(2);
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      text,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      html,
      `--${boundary}--`,
      ``
    ];
    return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  if (html) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    return headers.join("\r\n") + "\r\n\r\n" + html;
  }

  // por defecto texto plano
  headers.push(`Content-Type: text/plain; charset="UTF-8"`);
  return headers.join("\r\n") + "\r\n\r\n" + (text || "");
}

// Base64 URL-safe
function toBase64Url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok:false, error:"method_not_allowed" });
    }

    // Validación de env
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GMAIL_FROM) {
      return res.status(500).json({
        ok:false,
        error:"missing_env",
        detail:"Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN / GMAIL_FROM"
      });
    }

    const body = await getJsonBody(req);
    const to   = asList(body.to);
    const cc   = asList(body.cc);
    const bcc  = asList(body.bcc);
    const subject = String(body.subject || "").trim();
    const text    = body.text ? String(body.text) : null;
    const html    = body.html ? String(body.html) : null;
    const replyTo = body.reply_to ? String(body.reply_to) : null;

    if (!to.length)      return res.status(400).json({ ok:false, error:"missing_to" });
    if (!subject)        return res.status(400).json({ ok:false, error:"missing_subject" });
    if (!text && !html)  return res.status(400).json({ ok:false, error:"missing_body" });

    // OAuth2
    const oAuth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oAuth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: oAuth2 });

    // Construye MIME
    const mime = buildMime({
      fromEmail: GMAIL_FROM,
      fromName : GMAIL_SENDER_NAME,
      to, cc, bcc, subject, text, html, replyTo
    });

    const raw = toBase64Url(mime);

    const sendResp = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });

    return res.json({ ok:true, id: sendResp?.data?.id || null });

  } catch (err) {
    console.error("[/api/email/send] error:", err);
    const code = err?.code || err?.response?.status || 500;
    return res.status(code).json({
      ok:false,
      error: "send_failed",
      detail: String(err?.message || err)
    });
  }
}

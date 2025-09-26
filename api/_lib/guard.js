// api/_lib/guard.js

// ===== Utilidades de respuesta =====
export function send(res, status, payload = {}) {
  res.status(status).json({ ok: status < 400, ...payload });
}

export function badRequest(res, msg = 'Bad Request') {
  return send(res, 400, { error: msg });
}

export function notFound(res, msg = 'Not Found') {
  return send(res, 404, { error: msg });
}

// ===== CORS =====
function getAllowedOrigin() {
  try {
    const base = new URL(process.env.PUBLIC_BASE_URL || '');
    return base.origin;
  } catch {
    return '*'; // fallback si no configuraste PUBLIC_BASE_URL
  }
}

export function applyCors(req, res) {
  const origin = getAllowedOrigin();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin'); // para caches
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,x-admin-token'
  );
  // Responder preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

// ===== Auth Admin =====
export function assertAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
}

// ===== Helpers de entrada =====
export function ensureMethods(req, res, allowed = []) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(','));
    send(res, 405, { error: 'Method Not Allowed' });
    return false;
  }
  return true;
}

export function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export function requireFields(obj, fields = []) {
  const missing = fields.filter((k) => obj[k] === undefined || obj[k] === null || obj[k] === '');
  if (missing.length) {
    const e = new Error(`Missing fields: ${missing.join(', ')}`);
    e.status = 400;
    throw e;
  }
}

// ===== Wrapper principal =====
/**
 * guard: aplica CORS, valida método y captura errores para cualquier handler.
 * Uso: export default guard(['GET','POST'], async (req,res)=>{...})
 */
export function guard(allowedMethods, handler) {
  return async (req, res) => {
    try {
      if (applyCors(req, res)) return; // preflight
      if (!ensureMethods(req, res, allowedMethods)) return;
      await handler(req, res);
    } catch (err) {
      const code = err.status || 500;
      console.error('API error:', err);
      send(res, code, { error: err.message || 'Server Error' });
    }
  };
}

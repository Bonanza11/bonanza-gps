// api/_lib/guard.js
export function send(res, status, payload = {}) {
  res.status(status).json({ ok: status < 400, ...payload });
}

export function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function allowedOrigin() {
  try { return new URL(process.env.PUBLIC_BASE_URL).origin; } catch { return '*'; }
}

export function applyCors(req, res) {
  const origin = allowedOrigin();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-token');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export function assertAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    const e = new Error('Unauthorized'); e.status = 401; throw e;
  }
}

export function guard(methods, handler) {
  return async (req, res) => {
    try {
      if (applyCors(req, res)) return;
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(','));
        return send(res, 405, { error: 'Method Not Allowed' });
      }
      await handler(req, res);
    } catch (err) {
      const code = err.status || 500;
      console.error('API error:', err);
      send(res, code, { error: err.message || 'Server Error' });
    }
  };
}

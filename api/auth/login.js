import { guard, send, jsonBody } from '../_lib/guard.js';

export default guard(['POST'], async (req, res) => {
  const { token } = jsonBody(req);
  if (token && token === process.env.ADMIN_TOKEN) {
    return send(res, 200, { auth: true });
  }
  return send(res, 401, { error: 'Invalid token' });
});

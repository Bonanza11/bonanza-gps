import { guard, send, jsonBody } from '../_lib/guard.js';

function basePriceByMiles(mi) {
  if (mi <= 10) return 120;
  if (mi <= 35) return 190;
  if (mi <= 39) return 210;
  if (mi <= 48) return 230;
  if (mi <= 55) return 250;
  return mi * 5.40;
}

function isAfterHours(dt) {
  try { const h = new Date(dt).getHours(); return (h >= 22 || h < 6); }
  catch { return false; }
}

export default guard(['POST'], async (req, res) => {
  const b = jsonBody(req);
  const miles = Number(b.miles || 0);
  if (!miles) return send(res, 400, { error: 'Missing miles' });

  const pickupAt = b.pickupAt;
  const after = typeof b.afterHours === 'boolean' ? b.afterHours : isAfterHours(pickupAt);
  const surcharge = Number(b.countySurcharge || 0);

  let price = basePriceByMiles(miles);
  if (after) price *= 1.2;
  price = Math.round((price + surcharge) * 100) / 100;

  send(res, 200, { miles, afterHours: after, countySurcharge: surcharge, price, currency: 'USD' });
});

// /api/create-checkout-session-diff.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res){
  // CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"POST only" });
  }

  try{
    const { cn, diffAmount, customerEmail, metadata = {}, description } = req.body || {};
    // diffAmount = monto EN CENTAVOS (integer). Ej: $1.00 => 100
    if (!cn || !Number.isFinite(diffAmount) || diffAmount <= 0){
      return res.status(400).json({ ok:false, error:"Invalid cn/diffAmount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(diffAmount), // YA viene en centavos
          product_data: { name: description || `Reschedule difference for ${cn}` }
        },
        quantity: 1
      }],
      metadata: { cn, kind:'reschedule_diff', ...metadata },
      success_url: `${req.headers.origin}/reschedule-success.html?cn=${encodeURIComponent(cn)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/reschedule.html?cn=${encodeURIComponent(cn)}`
    });

    return res.status(200).json({ ok:true, id: session.id, url: session.url });
  }catch(e){
    console.error(e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

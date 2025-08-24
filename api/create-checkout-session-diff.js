// /api/create-checkout-session-diff.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res){
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"POST only" });
  }

  try{
    const { cn, diffAmount, customerEmail } = req.body || {};

    // diffAmount debe venir en CENTAVOS desde el frontend
    const cents = Number(diffAmount);

    if (!cn || !Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
      return res.status(400).json({ ok:false, error:"Invalid cn/diffAmount (must be positive integer cents)" });
    }

    const origin = req.headers.origin || '';

    const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  customer_email: customerEmail || undefined,
  line_items: [{
    price_data: {
      currency: 'usd',
      unit_amount: 100, // 👈 SIEMPRE $1.00 (100 centavos)
      product_data: { name: `Test payment for ${cn}` }
    },
    quantity: 1
  }],
  metadata: { cn, kind: 'reschedule_test' },
  success_url: `${req.headers.origin}/reschedule-success.html?cn=${encodeURIComponent(cn)}`,
  cancel_url: `${req.headers.origin}/reschedule.html?cn=${encodeURIComponent(cn)}`
});

    return res.status(200).json({ ok:true, id: session.id, url: session.url });
  }catch(e){
    console.error(e);
    return res.status(500).json({ ok:false, error:e.message });
  }
}

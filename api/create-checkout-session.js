import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Bonanza Transportation Ride',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: 'https://bonanza-gps.vercel.app/success.html',
      cancel_url: 'https://bonanza-gps.vercel.app/cancel.html',
    });

    return res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Stripe session error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

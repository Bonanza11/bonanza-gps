const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
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
      mode: 'payment',
      success_url: 'https://bonanza-gps.vercel.app/success',
      cancel_url: 'https://bonanza-gps.vercel.app/cancel',
    });

    res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe ERROR:', err);
    res.status(500).json({ error: 'Stripe session failed' });
  }
};

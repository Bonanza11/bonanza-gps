export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    envPresent: !!process.env.STRIPE_SECRET_KEY,
    node: process.version
  });
}

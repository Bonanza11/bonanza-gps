// /api/book/upsert-from-session.js
import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";

export const config = { runtime: "nodejs" };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error:"method_not_allowed" });
  }
  if (!process.env.DATABASE_URL)  return res.status(500).json({ ok:false, error:"missing_database_url" });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ ok:false, error:"missing_stripe_secret_key" });

  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ ok:false, error:"missing_session_id" });

    // Leer sesión de Stripe
    const s = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent","payment_intent.charges.data.balance_transaction"],
    });
    const md = s.metadata || {};
    const cn = md.confirmationNumber || md.cn || "";
    if (!cn) return res.status(400).json({ ok:false, error:"missing_cn_in_metadata" });

    const status = ((s.payment_status || s.status || "open").toUpperCase() === "PAID") ? "PAID"
                  : (s.payment_status || s.status || "OPEN").toUpperCase();

    // Mapear datos
    const row = {
      confirmation_number : cn,
      status,
      full_name           : md.fullname || "",
      phone               : md.phone || "",
      email               : s.customer_details?.email || s.customer_email || md.email || "",
      pickup              : md.pickup || "",
      dropoff             : md.dropoff || "",
      date_iso            : md.date || null,
      time_hhmm           : md.time || null,
      vehicle_type        : (md.vehicleType || "").toLowerCase() || null,
      distance_miles      : md.distanceMiles ? Number(md.distanceMiles) : null,
      quoted_total        : md.quotedTotal ? Number(md.quotedTotal) : null,
      flight_number       : md.flightNumber || null,
      flight_origin_city  : md.flightOriginCity || null,
      tail_number         : md.tailNumber || null,
      private_origin_city : md.privateFlightOriginCity || null,
      special_instructions: md.specialInstructions || null,
      mg_choice           : md.meetAndGreet || md.mgChoice || null,
      stripe_session_id   : s.id,
      stripe_payment_intent: s.payment_intent?.id || null,
    };

    const sql = neon(process.env.DATABASE_URL);
    await sql`
      insert into bookings(
        confirmation_number,status,full_name,phone,email,
        pickup,dropoff,date_iso,time_hhmm,vehicle_type,
        distance_miles,quoted_total,flight_number,flight_origin_city,
        tail_number,private_origin_city,special_instructions,mg_choice,
        stripe_session_id,stripe_payment_intent
      ) values (
        ${row.confirmation_number}, ${row.status}, ${row.full_name}, ${row.phone}, ${row.email},
        ${row.pickup}, ${row.dropoff}, ${row.date_iso}, ${row.time_hhmm}, ${row.vehicle_type},
        ${row.distance_miles}, ${row.quoted_total}, ${row.flight_number}, ${row.flight_origin_city},
        ${row.tail_number}, ${row.private_origin_city}, ${row.special_instructions}, ${row.mg_choice},
        ${row.stripe_session_id}, ${row.stripe_payment_intent}
      )
      on conflict (confirmation_number)
      do update set
        status=${row.status},
        full_name=${row.full_name}, phone=${row.phone}, email=${row.email},
        pickup=${row.pickup}, dropoff=${row.dropoff},
        date_iso=${row.date_iso}, time_hhmm=${row.time_hhmm},
        vehicle_type=${row.vehicle_type},
        distance_miles=${row.distance_miles},
        quoted_total=${row.quoted_total},
        flight_number=${row.flight_number},
        flight_origin_city=${row.flight_origin_city},
        tail_number=${row.tail_number},
        private_origin_city=${row.private_origin_city},
        special_instructions=${row.special_instructions},
        mg_choice=${row.mg_choice},
        stripe_session_id=${row.stripe_session_id},
        stripe_payment_intent=${row.stripe_payment_intent},
        updated_at=now()
    `;

    return res.json({ ok:true, cn, status });
  } catch (err) {
    console.error("[upsert-from-session] ", err);
    return res.status(err?.statusCode || 500).json({ ok:false, error:String(err?.message || err) });
  }
}

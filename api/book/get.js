// /api/book/get.js
export default function handler(req, res) {
  const { cn } = req.query;

  if (String(cn).toUpperCase() === "BZ-20250927-TEST") {
    return res.status(200).json({
      ok: true,
      booking: {
        confirmation_number: "BZ-20250927-TEST",
        status: "confirmed",
        full_name: "John Doe",
        email: "john@example.com",
        phone: "801-555-1234",
        pickup: "Salt Lake City International Airport",
        dropoff: "St. Regis Deer Valley",
        date_iso: "2025-09-28",
        time_hhmm: "15:30",
        vehicle_type: "suv",
        mg_choice: "tsa_exit",
        distance_miles: 36.5,
        quoted_total: 21000, // $210.00
        flight_number: "DL1234",
        flight_origin_city: "Miami (MIA)"
      }
    });
  }

  return res.status(404).json({ ok: false, error: "Not found" });
}

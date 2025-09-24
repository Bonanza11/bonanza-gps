// Reschedule controller
const $ = (s) => document.querySelector(s);
const $all = (s) => Array.from(document.querySelectorAll(s));

let state = {
  booking: null,
  vehicleType: "suv",
  meetGreet: "none",
  miles: 0,
  quoteCents: 0,
  diffCents: 0,
};

function fmt(cents){ return `$${(cents/100).toFixed(2)}`; }

async function fetchJSON(url, opts){
  const r = await fetch(url, { headers:{ "Content-Type":"application/json" }, ...opts });
  const t = await r.text();
  try { return { status:r.status, json: JSON.parse(t) }; }
  catch { return { status:r.status, json:{ ok:false, error:t } }; }
}

$("#load").addEventListener("click", async () => {
  const cn = $("#cn").value.trim();
  $("#status").textContent = "Loading…";
  const { status, json } = await fetchJSON(`/api/book/get?cn=${encodeURIComponent(cn)}`);
  if (status !== 200 || !json.ok) {
    $("#status").textContent = `Error: ${json.error || status}`;
    $("#form").classList.add("is-hidden");
    return;
  }
  state.booking = json.booking;

  // Prefill UI
  $("#pickup").value = state.booking.pickup || "";
  $("#dropoff").value = state.booking.dropoff || "";
  $("#date").value = state.booking.date_iso || "";
  $("#time").value = state.booking.time_hhmm || "";
  state.vehicleType = (state.booking.vehicle_type || "suv");
  state.meetGreet = state.booking.mg_choice || "none";
  $("#origTotal").textContent = fmt(Math.round(Number(state.booking.quoted_total || 0)*100) || 0);

  // toggle veh buttons
  $all(".veh-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.type === state.vehicleType);
    b.onclick = ()=> {
      state.vehicleType = b.dataset.type;
      $all(".veh-btn").forEach(x=>x.classList.toggle("active", x===b));
    };
  });

  // mg buttons
  $all(".mg-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.choice === state.meetGreet);
    b.onclick = ()=>{
      state.meetGreet = b.dataset.choice;
      $all(".mg-btn").forEach(x=>x.classList.toggle("active", x===b));
    };
  });

  $("#form").classList.remove("is-hidden");
  $("#summary").classList.add("is-hidden");
  $("#status").textContent = "";
});

$("#recalc").addEventListener("click", async () => {
  const pickup = $("#pickup").value.trim();
  const dropoff = $("#dropoff").value.trim();
  if (!pickup || !dropoff) { $("#status").textContent = "Pickup and dropoff are required."; return; }

  // Usa tu función de maps para distancia (en millas)
  // Si no la tienes, sustituye por tu cálculo.
  let miles = 0;
  try {
    miles = await window.getDistanceMiles(pickup, dropoff); // <- de maps.js
  } catch(e){
    console.warn(e);
  }
  if (!miles || !Number.isFinite(miles)) { $("#status").textContent = "Could not compute distance."; return; }
  state.miles = miles;

  // Pide quote al backend
  const { status, json } = await fetchJSON("/api/book/quote", {
    method:"POST",
    body: JSON.stringify({
      pickup, dropoff,
      distance_miles: miles,
      vehicleType: state.vehicleType,
      meetGreet: state.meetGreet,
    })
  });
  if (status !== 200 || !json.ok) { $("#status").textContent = `Quote error: ${json.error||status}`; return; }

  state.quoteCents = json.quote.total_cents;
  const originalCents = Math.round(Number(state.booking.quoted_total || 0)*100) || 0;

  $("#newQuote").textContent = fmt(state.quoteCents);
  $("#origTotal").textContent = fmt(originalCents);

  // diferencia a pagar (si es mayor)
  state.diffCents = Math.max(0, state.quoteCents - originalCents);
  $("#diff").textContent = fmt(state.diffCents);

  // nota
  const note = $("#note");
  if (state.diffCents > 0) {
    note.textContent = "The new route is more expensive. You’ll be asked to pay the difference.";
  } else {
    note.textContent = "The new route is cheaper or equal. Your original total applies (no refunds).";
  }

  $("#summary").classList.remove("is-hidden");
});

// Submit (pagar diferencia si aplica y luego guardar)
$("#payOrSave").addEventListener("click", async () => {
  const cn = $("#cn").value.trim();
  const newDate = $("#date").value;
  const newTime = $("#time").value;
  const pickup = $("#pickup").value.trim();
  const dropoff = $("#dropoff").value.trim();

  let stripePaymentIntentId = null;

  // 1) si hay diferencia, crea checkout en Stripe
  if (state.diffCents > 0) {
    const { status, json } = await fetchJSON("/api/create-checkout-session-diff", {
      method:"POST",
      body: JSON.stringify({
        cn,
        diffAmount: state.diffCents,              // en centavos
        customerEmail: state.booking.email || "",
        metadata: { reason:"reschedule_diff", cn },
        description: `Reschedule difference for ${cn}`
      })
    });
    if (status !== 200 || !json.ok) { $("#status").textContent = `Stripe error: ${json.error||status}`; return; }

    // redirige a Stripe Checkout
    window.location.href = json.url;  // tu endpoint debe devolver {url}
    return; // regresará por success_url en tu app
  }

  // 2) si NO hay diferencia → guarda directamente
  const save = await fetchJSON("/api/book/reschedule", {
    method:"POST",
    body: JSON.stringify({
      cn,
      pickup, dropoff,
      vehicleType: state.vehicleType,
      meetGreet: state.meetGreet,
      distance_miles: state.miles,
      newDate, newTime,
      diffCents: state.diffCents,
      stripePaymentIntentId // null
    })
  });
  if (save.status !== 200 || !save.json.ok) { $("#status").textContent = `Save error: ${save.json.error||save.status}`; return; }
  $("#status").textContent = "Reschedule completed.";
});

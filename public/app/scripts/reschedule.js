// ===============================
// Bonanza Transportation Reschedule
// Elegante, profesional y organizado
// ===============================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const elCN = $("#cn");
const btnLoad = $("#load");
const statusMsg = $("#status");

const form = $("#form");
const pickupInput = $("#pickup");
const dropoffInput = $("#dropoff");
const vehicleBtns = $$("#vehicle button");
const mgBtns = $$("#mg button");
const dateInput = $("#date");
const timeInput = $("#time");
const btnRecalc = $("#recalc");

const summaryBox = $("#summary");
const origTotalEl = $("#origTotal");
const newQuoteEl = $("#newQuote");
const diffEl = $("#diff");
const noteEl = $("#note");
const btnPayOrSave = $("#payOrSave");

// ========== STATE ==========
let booking = null;
let state = {
  vehicleType: "suv",
  meetGreet: "none",
  miles: 0,
  quoteCents: 0,
  diffCents: 0,
};

// ========== HELPERS ==========
function fmtMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function setStatus(msg, type = "ok") {
  statusMsg.textContent = msg || "";
  statusMsg.style.color =
    type === "err" ? "#ff6b6b" : type === "warn" ? "#ffdd57" : "#b87333";
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const txt = await r.text();
  try {
    return { status: r.status, json: JSON.parse(txt) };
  } catch {
    return { status: r.status, json: { ok: false, error: txt } };
  }
}

// ========== TOGGLES ==========
vehicleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.vehicleType = btn.dataset.type;
    vehicleBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

mgBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.meetGreet = btn.dataset.choice;
    mgBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ========== LOAD RESERVATION ==========
btnLoad.addEventListener("click", async () => {
  const cn = elCN.value.trim();
  if (!cn) {
    setStatus("Please enter your reservation code.", "warn");
    return;
  }
  setStatus("Loading reservation…");
  const { status, json } = await fetchJSON(`/api/book/get?cn=${encodeURIComponent(cn)}`);

  if (status !== 200 || !json.ok) {
    setStatus(json.error || "Reservation not found.", "err");
    form.classList.add("hidden");
    return;
  }

  booking = json.booking;

  // Prefill
  pickupInput.value = booking.pickup || "";
  dropoffInput.value = booking.dropoff || "";
  dateInput.value = booking.date_iso || "";
  timeInput.value = booking.time_hhmm || "";
  state.vehicleType = booking.vehicle_type || "suv";
  state.meetGreet = booking.mg_choice || "none";

  vehicleBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.type === state.vehicleType)
  );
  mgBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.choice === state.meetGreet)
  );

  origTotalEl.textContent = fmtMoney(
    Math.round(Number(booking.quoted_total || 0) * 100)
  );

  form.classList.remove("hidden");
  summaryBox.classList.add("hidden");
  setStatus(`Reservation loaded: ${booking.confirmation_number}`, "ok");
});

// ========== RECALCULATE ==========
btnRecalc.addEventListener("click", async () => {
  const pickup = pickupInput.value.trim();
  const dropoff = dropoffInput.value.trim();
  if (!pickup || !dropoff) {
    setStatus("Pickup and dropoff are required.", "warn");
    return;
  }

  let miles = 0;
  try {
    miles = await window.getDistanceMiles(pickup, dropoff); // usa Google Maps
  } catch (e) {
    console.error("Distance error", e);
  }
  if (!miles) {
    setStatus("Could not calculate distance.", "err");
    return;
  }
  state.miles = miles;

  const { status, json } = await fetchJSON("/api/book/quote", {
    method: "POST",
    body: JSON.stringify({
      pickup,
      dropoff,
      distance_miles: miles,
      vehicleType: state.vehicleType,
      meetGreet: state.meetGreet,
    }),
  });

  if (status !== 200 || !json.ok) {
    setStatus(json.error || "Error calculating quote.", "err");
    return;
  }

  state.quoteCents = json.quote.total_cents;
  const originalCents = Math.round(Number(booking.quoted_total || 0) * 100) || 0;

  origTotalEl.textContent = fmtMoney(originalCents);
  newQuoteEl.textContent = fmtMoney(state.quoteCents);

  state.diffCents = Math.max(0, state.quoteCents - originalCents);
  diffEl.textContent = fmtMoney(state.diffCents);

  if (state.diffCents > 0) {
    noteEl.textContent =
      "This new route is more expensive. You’ll be asked to pay the difference.";
  } else {
    noteEl.textContent =
      "New route is cheaper or equal. Your original total still applies.";
  }

  summaryBox.classList.remove("hidden");
  setStatus("Quote recalculated successfully.", "ok");
});

// ========== SUBMIT ==========
btnPayOrSave.addEventListener("click", async () => {
  const cn = elCN.value.trim();
  const pickup = pickupInput.value.trim();
  const dropoff = dropoffInput.value.trim();
  const newDate = dateInput.value;
  const newTime = timeInput.value;

  // Si hay diferencia → Stripe
  if (state.diffCents > 0) {
    const { status, json } = await fetchJSON("/api/create-checkout-session-diff", {
      method: "POST",
      body: JSON.stringify({
        cn,
        diffAmount: state.diffCents,
        customerEmail: booking.email || "",
        metadata: { reason: "reschedule_diff", cn },
        description: `Reschedule difference for ${cn}`,
      }),
    });

    if (status !== 200 || !json.ok) {
      setStatus(json.error || "Stripe error.", "err");
      return;
    }
    window.location.href = json.url;
    return;
  }

  // Si no hay diferencia → guardar directo
  const save = await fetchJSON("/api/book/reschedule", {
    method: "POST",
    body: JSON.stringify({
      cn,
      pickup,
      dropoff,
      vehicleType: state.vehicleType,
      meetGreet: state.meetGreet,
      distance_miles: state.miles,
      newDate,
      newTime,
      diffCents: state.diffCents,
    }),
  });

  if (save.status !== 200 || !save.json.ok) {
    setStatus(save.json.error || "Reschedule failed.", "err");
    return;
  }

  setStatus("Reschedule completed successfully.", "ok");
  summaryBox.classList.add("hidden");
  form.classList.add("hidden");
});

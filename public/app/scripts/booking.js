/*
booking.js — Bonanza Transportation (Booking Logic)
──────────────────────────────────────────────────
Rol de este archivo:
- Calcula el precio (tabla oficial + after-hours + Meet & Greet + tipo de vehículo).
- Controla el toggle de Términos & Condiciones (habilita "Calculate" y "PAY NOW").
- Maneja el acordeón de Luggage.
- Conecta el botón "Calculate Price" con Google Directions para medir millas.
- Muestra el resumen (distancia, duración, precio) en #info.
- Deja el total en window.__lastQuotedTotal para que stripe.js lo use.

Requisitos / Dependencias:
- maps.js ya carga Google Maps JS API (con "places") y expone window.google.
- HTML con ids: fullname, phone, email, pickup, dropoff, date, time, meetGreetCard, calculate, pay, info.
- Botones de vehículo .veh-btn con data-type="suv" | "van".
- Botones de Meet & Greet .mg-btn con data-choice (tsa_exit, baggage_claim, none).
- Stripe.js en otra ruta (stripe.js) leerá window.__lastQuotedTotal.

Notas:
- Si aún no aceptan Términos, los botones siguen deshabilitados.
- Si la API de Maps no está lista, mostramos alerta al calcular.
*/

window.BNZ = window.BNZ || {};

/* =========================
   Config / Constantes
========================= */
BNZ.OPERATING_START = "06:00";
BNZ.OPERATING_END   = "23:00";
BNZ.AFTER_HOURS_PCT = 0.20;  // 20%

/* =========================
   Pricing oficial
========================= */
BNZ.calculateBase = (mi) => {
  if (mi <= 10) return 120;
  if (mi <= 35) return 190;
  if (mi <= 39) return 210;
  if (mi <= 48) return 230;
  if (mi <= 55) return 250;
  return mi * 5.4;
};

BNZ.applyVehicleMultiplier = (total, vehicle) =>
  vehicle === "van" ? Math.round(total * 1.30) : total;

/* =========================
   Meet & Greet (UI + fee)
========================= */
BNZ.mgChoice = "none";
BNZ.getMGFee = () => (BNZ.mgChoice === "none" ? 0 : 50);

(function wireMeetGreet() {
  const card = document.getElementById("meetGreetCard");
  const btns = document.querySelectorAll(".mg-btn");
  if (!card || !btns.length) return;

  const activate = (choice) => {
    BNZ.mgChoice = choice;
    btns.forEach(b => {
      const on = b.dataset.choice === choice;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  };

  btns.forEach(b => b.addEventListener("click", () => activate(b.dataset.choice)));
  activate("none"); // default
})();

/* =========================
   Selector de vehículo
========================= */
BNZ.vehicle = "suv"; // default

(function wireVehicle() {
  const btns = document.querySelectorAll(".veh-btn");
  const carImg = document.querySelector(".turntable .car");
  const caption = document.querySelector(".turntable .vehicle-caption");
  const SUV_IMG = "/images/suburban.png";
  const VAN_IMG = "/images/van-sprinter.png";

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      BNZ.vehicle = btn.dataset.type || "suv";

      // Actualiza visual
      if (BNZ.vehicle === "suv") {
        if (carImg) carImg.src = SUV_IMG;
        if (caption) caption.textContent = "SUV — Max 5 passengers, 5 suitcases";
      } else {
        if (carImg) carImg.src = VAN_IMG;
        if (caption) caption.textContent = "Van — Up to 12 Passengers";
      }
    });
  });
})();

/* =========================
   Términos (toggle)
========================= */
(function wireTermsToggle() {
  const pill = document.getElementById("acceptPill");
  const calc = document.getElementById("calculate");
  const pay  = document.getElementById("pay");

  if (!pill) return;

  const sync = () => {
    const on = pill.classList.contains("on");
    if (calc) calc.disabled = !on;
    if (pay)  pay.disabled  = !on || !window.__lastQuotedTotal;
    if (pay)  pay.style.display = "block"; // visible siempre, pero deshabilitado si no aplica
    if (pay)  pay.style.opacity  = pay.disabled ? 0.5 : 1;
  };

  pill.addEventListener("click", () => { pill.classList.toggle("on"); sync(); });
  pill.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); pill.classList.toggle("on"); sync(); }
  });

  sync();
})();

/* =========================
   Luggage accordion
========================= */
(function wireLuggageAccordion() {
  document.querySelectorAll(".luggage-accordion").forEach(acc => {
    const sum = acc.querySelector(".luggage-summary");
    sum?.addEventListener("click", () => acc.classList.toggle("open"));
  });
})();

/* =========================
   Helpers: fecha/hora
========================= */
function isAfterHours(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  const [sh, sm] = BNZ.OPERATING_START.split(":").map(Number);
  const [eh, em] = BNZ.OPERATING_END.split(":").map(Number);
  const start = new Date(d); start.setHours(sh, sm, 0, 0);
  const end   = new Date(d); end.setHours(eh, em, 0, 0);
  return (d < start) || (d > end);
}

function isAtLeast24hAhead(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const sel = new Date(`${dateStr}T${timeStr}:00`);
  return sel.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
}

/* =========================
   Render del resumen
========================= */
function renderSummary(leg, base, afterHoursFee, mgFee, vehicle) {
  const miles = leg.distance.value / 1609.34; // metros → millas
  const total = BNZ.applyVehicleMultiplier(base + afterHoursFee + mgFee, vehicle);

  const info = document.getElementById("info");
  if (!info) return;

  info.style.display = "block";
  info.innerHTML = `
    <h3 class="info-title">Trip Summary</h3>
    <div class="kpis">
      <div class="kpi"><div class="label">Distance</div><div class="value">${miles.toFixed(1)}<span class="unit">mi</span></div></div>
      <div class="kpi"><div class="label">Duration</div><div class="value">${leg.duration.text}</div></div>
      <div class="kpi"><div class="label">Price</div><div class="value price">$${total.toFixed(2)}</div></div>
    </div>
    <div class="divider"></div>
    <div class="breakdown">
      <div class="row"><span>Base</span><span>$${base.toFixed(2)}</span></div>
      ${afterHoursFee > 0 ? `<div class="row"><span>After-Hours (20%)</span><span>$${afterHoursFee.toFixed(2)}</span></div>` : ""}
      ${mgFee > 0 ? `<div class="row"><span>Meet & Greet (SLC)</span><span>$${mgFee.toFixed(2)}</span></div>` : ""}
      <div class="row total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    </div>
    <div class="tax-note">Taxes & gratuity included</div>
  `;

  // Dejar valores globales para Stripe
  window.__lastQuotedTotal   = total;
  window.__lastDistanceMiles = miles;
  window.__vehicleType       = vehicle;

  // Habilitar PAY si los términos están aceptados
  const pay  = document.getElementById("pay");
  const pill = document.getElementById("acceptPill");
  const accepted = pill && pill.classList.contains("on");
  if (pay) {
    pay.disabled = !accepted;
    pay.style.display = "block";
    pay.style.opacity = accepted ? 1 : 0.5;
  }
}

/* =========================
   Cálculo de ruta + precio
========================= */
(function wireCalculate() {
  const calcBtn = document.getElementById("calculate");
  if (!calcBtn) return;

  calcBtn.addEventListener("click", async () => {
    const pill = document.getElementById("acceptPill");
    if (!pill || !pill.classList.contains("on")) {
      alert("Please accept Terms & Conditions first.");
      return;
    }

    const pickup  = document.getElementById("pickup")?.value.trim();
    const dropoff = document.getElementById("dropoff")?.value.trim();
    const dateStr = document.getElementById("date")?.value.trim();
    const timeStr = document.getElementById("time")?.value.trim();

    // Validaciones mínimas
    if (!pickup)  return alert("Pick-up Address is required.");
    if (!dropoff) return alert("Drop-off Address is required.");
    if (!dateStr || !timeStr) return alert("Please select Date & Time.");
    if (!isAtLeast24hAhead(dateStr, timeStr))
      return alert("Please choose a Date & Time at least 24 hours in advance.");

    // Google disponible
    if (!(window.google && google.maps && google.maps.DirectionsService)) {
      alert("Google Maps is not loaded yet. Please try again in a moment.");
      return;
    }

    try {
      const directionsService  = new google.maps.DirectionsService();
      const directionsRenderer = new google.maps.DirectionsRenderer();
      const mapEl = document.getElementById("map");
      if (mapEl) {
        const map = new google.maps.Map(mapEl, { center: { lat: 40.76, lng: -111.89 }, zoom: 10 });
        directionsRenderer.setMap(map);
      }

      const req = {
        origin: pickup,            // aceptamos string (no hace falta place_id)
        destination: dropoff,
        travelMode: google.maps.TravelMode.DRIVING,
      };

      const route = await new Promise((resolve, reject) => {
        directionsService.route(req, (result, status) => {
          if (status === "OK" && result?.routes?.[0]) return resolve(result);
          reject(new Error(status || "ROUTE_ERROR"));
        });
      });

      directionsRenderer.setDirections(route);
      const leg = route.routes[0].legs[0];
      const miles = leg.distance.value / 1609.34;

      const base = BNZ.calculateBase(miles);
      const ah   = isAfterHours(dateStr, timeStr) ? base * BNZ.AFTER_HOURS_PCT : 0;
      const mg   = BNZ.getMGFee();
      renderSummary(leg, base, ah, mg, BNZ.vehicle);
    } catch (err) {
      console.error(err);
      alert("Could not calculate the route. Please verify the addresses.");
    }
  });
})();

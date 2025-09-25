/* =========================================================
   Archivo: /public/app/scripts/booking.js
   Propósito:
     - Pricing/UI del flujo de booking (sin lógica de ruta).
     - Total = base + extras (surcharge + M&G) + after-hours (25%),
       con multiplicador por vehículo (van = +30% redondeado).
     - Campo HORA en un solo <select id="time"> con AM/PM (scroll).
     - Toggle de Términos, acordeón de equipaje, recálculo “en vivo”.
     - Reglas de Aeropuertos/JSX/FBO según texto del Pick-up.
   ========================================================= */

window.BNZ = window.BNZ || {};

/* ------------------ Config & Constantes ------------------ */

// Horario operativo (AM/PM) — usado por BNZ.isAfterHours
BNZ.OPERATING_START_AMPM = "7:00 AM";
BNZ.OPERATING_END_AMPM   = "10:30 PM";

// After-hours = 25%
BNZ.AFTER_HOURS_PCT = 0.25;

/* Palabras clave para detectar tipo de origen */
const COMMERCIAL_KEYS = [
  "slc airport", "salt lake city international", "slc terminal", "w terminal dr"
];
const JSX_KEYS = ["jsx"];
const FBO_KEYS = [
  "atlantic aviation", "signature", "signature flight", "million air", "tac air",
  "salt lake jet center", "skypark", "south valley regional", "kslc fbo"
];

/* ======================= Helpers de hora ======================= */

// "7:05 PM" -> {h24:19, m:5}
function parseAmPmTo24h(str) {
  if (!str) return null;
  const s = String(str).trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2] ?? '0', 10);
  const ap = m[3];
  if (h < 1 || h > 12 || mm < 0 || mm > 59) return null;
  if (ap === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
  return { h24: h, m: mm };
}

// "21:30" -> {h24:21, m:30}
function parse24h(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h24: h, m: mm };
}

function toMinutes(h, m) { return (h * 60) + m; }
function parseOperatingBound(str) {
  const t = parseAmPmTo24h(str);
  return t ? toMinutes(t.h24, t.m) : null;
}

/** Construye opciones de 7:00 AM a 10:45 PM cada 15 min.
 *  value = "HH:MM" 24h ; label = "h:mm AM/PM"
 */
function buildTimeOptions() {
  const sel = document.getElementById('time');
  if (!sel || sel.tagName !== 'SELECT') return;

  // limpia todo salvo el primer option (placeholder)
  sel.innerHTML = '<option value="">Select time…</option>';

  const start = parseOperatingBound(BNZ.OPERATING_START_AMPM) ?? 7*60;
  const end   = parseOperatingBound(BNZ.OPERATING_END_AMPM) ?? (22*60+30);
  // extendemos 15 min para incluir 10:45 PM como tope visible
  const END_PLUS = end + 15;

  for (let mins = start; mins <= END_PLUS; mins += 15) {
    const h24 = Math.floor(mins / 60);
    const m   = mins % 60;

    // label 12h
    let h12 = h24 % 12; if (h12 === 0) h12 = 12;
    const ap = (h24 < 12 ? 'AM' : 'PM');
    const label = `${h12}:${String(m).padStart(2,'0')} ${ap}`;

    // value 24h
    const value = `${String(h24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

/** Devuelve "HH:MM" (24h) desde el <select id="time"> */
BNZ.getTime24h = function() {
  const sel = document.getElementById('time');
  if (!sel) return null;
  const v = (sel.value || '').trim();
  const t24 = parse24h(v);
  return t24 ? `${String(t24.h24).padStart(2,'0')}:${String(t24.m).padStart(2,'0')}` : null;
};

/* ------------------ Pricing base & helpers ------------------ */

BNZ.calculateBase = (mi)=>{
  if (mi<=10) return 120;
  if (mi<=35) return 190;
  if (mi<=39) return 210;
  if (mi<=48) return 230;
  if (mi<=55) return 250;
  return mi * 5.4;
};

BNZ.applyVehicleMultiplier = (total, vehicle)=>{
  const v = vehicle || BNZ.selectedVehicle || getVehicleFromUI();
  return v === 'van' ? Math.round(total * 1.30) : total;
};

function getVehicleFromUI(){
  const active = document.querySelector('.veh-btn.active');
  return active?.dataset?.type || 'suv';
}

/* ------------------ Meet & Greet ------------------ */

BNZ.mgChoice = BNZ.mgChoice || "none";
BNZ.getMGFee = ()=> BNZ.mgChoice === "none" ? 0 : 50;

(function wireMeetGreet(){
  const card = document.getElementById('meetGreetCard');
  if(!card) return;
  const btns = card.querySelectorAll('.mg-btn');
  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      BNZ.mgChoice = btn.dataset.choice;
      btns.forEach(b=>{
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      BNZ.recalcFromCache?.();
    });
  });
})();

/* ------------------ After-hours ------------------ */

BNZ.isAfterHours = (dateStr, timeStrOr24h)=>{
  if(!dateStr || !timeStrOr24h) return false;

  // Acepta "HH:MM" o "h:mm AM/PM"
  let h24, m;
  const as24 = parse24h(timeStrOr24h);
  if (as24) { h24 = as24.h24; m = as24.m; }
  else {
    const ampm = parseAmPmTo24h(timeStrOr24h);
    if (!ampm) return false;
    h24 = ampm.h24; m = ampm.m;
  }

  const curMin = toMinutes(h24, m);
  const startMin = parseOperatingBound(BNZ.OPERATING_START_AMPM) ?? (7*60);
  const endMin   = parseOperatingBound(BNZ.OPERATING_END_AMPM)   ?? (22*60+30);

  return (curMin < startMin) || (curMin > endMin);
};

/* ------------------ Quote desde backend ------------------ */

async function fetchServerQuote({ distanceMiles, pickupISO, extras = 0 }) {
  const body = { distance_miles: distanceMiles, pickup_time: pickupISO, extras };
  const resp = await fetch('/api/reservations/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) throw new Error(json.error || 'quote_failed');
  return json.data;
}

/* ------------------ Render del resumen ------------------ */

BNZ.__lastBase = null;
BNZ.__lastSurcharge = 0;
BNZ.__lastAhFee = 0;
BNZ.__lastDistanceMiles = 0;
BNZ.__lastDurationText = '';
BNZ.__lastVehicle = 'suv';
BNZ.__lastQuotedTotal = 0;

BNZ.renderQuote = async function(leg, opts={}){
  if(!leg || !leg.distance || !leg.duration){
    alert("Route not ready. Please select valid addresses and try again.");
    return;
  }

  const miles = leg.distance.value / 1609.34;
  const surcharge = Number(opts.surcharge || 0);
  const mgFee = BNZ.getMGFee();

  // Fecha/hora del formulario -> ISO
  const dateStr = document.getElementById('date')?.value || '';
  const hhmm24  = BNZ.getTime24h(); // del <select id="time">
  let pickupISO = null;
  if (dateStr && hhmm24) {
    pickupISO = `${dateStr}T${hhmm24}:00`;
  }

  let q;
  try {
    q = await fetchServerQuote({
      distanceMiles: miles,
      pickupISO,
      extras: (surcharge + mgFee)
    });
  } catch (e) {
    console.error('quote_failed', e);
    const baseFallback = BNZ.calculateBase(miles);
    const afterHoursLocal = hhmm24 ? BNZ.isAfterHours(dateStr, hhmm24) : false;
    const ahFeeLocal = afterHoursLocal ? (baseFallback + surcharge + mgFee) * BNZ.AFTER_HOURS_PCT : 0;
    q = {
      miles: +miles.toFixed(2),
      base: baseFallback,
      after_hours: +ahFeeLocal.toFixed(2),
      extras: +(surcharge + mgFee).toFixed(2),
      subtotal: +(baseFallback + ahFeeLocal + surcharge + mgFee).toFixed(2),
      total: Math.ceil(baseFallback + ahFeeLocal + surcharge + mgFee),
      breakdown: { table: "fallback-local" }
    };
  }

  const vehicle = BNZ.selectedVehicle || getVehicleFromUI();
  const totalWithVehicle = BNZ.applyVehicleMultiplier(q.total, vehicle);

  // Cache
  BNZ.__lastBase = q.base;
  BNZ.__lastSurcharge = surcharge;
  BNZ.__lastAhFee = q.after_hours;
  BNZ.__lastDistanceMiles = q.miles;
  BNZ.__lastDurationText = leg.duration.text || '';
  BNZ.__lastVehicle = vehicle;
  BNZ.__lastQuotedTotal = totalWithVehicle;

  // UI
  const el = document.getElementById('info');
  if(!el) return;
  el.style.display = "block";
  const hasExtra = (surcharge + mgFee) > 0 || (q.after_hours > 0);
  el.innerHTML = `
    <h3 class="info-title">Trip Summary</h3>
    <div class="kpis">
      <div class="kpi"><div class="label">Distance</div><div class="value">${q.miles.toFixed(1)}<span class="unit">mi</span></div></div>
      <div class="kpi"><div class="label">Duration</div><div class="value">${leg.duration.text}</div></div>
      <div class="kpi"><div class="label">Price</div><div class="value price">$${totalWithVehicle.toFixed(2)}</div></div>
    </div>
    ${hasExtra ? `
      <div class="divider"></div>
      <div class="breakdown">
        ${q.after_hours > 0 ? `<div class="row"><span>After-Hours Fee (25%)</span><span>$${q.after_hours.toFixed(2)}</span></div>` : ''}
        ${(surcharge + mgFee) > 0 ? `<div class="row"><span>Extras (Surcharge + Meet & Greet)</span><span>$${(surcharge + mgFee).toFixed(2)}</span></div>` : ''}
        <div class="row total"><span>Total</span><span>$${totalWithVehicle.toFixed(2)}</span></div>
        <div class="tax-note">Taxes & gratuity included</div>
      </div>
    ` : `
      <div class="breakdown">
        <div class="row total"><span>Total</span><span>$${totalWithVehicle.toFixed(2)}</span></div>
        <div class="tax-note">Taxes & gratuity included</div>
      </div>
    `}
  `;
  syncButtons();
};

/* ------------------ Recalcular ------------------ */
BNZ.recalcFromCache = function(){
  const el = document.getElementById('info');
  if (!el || BNZ.__lastBase == null) return;

  const base = BNZ.__lastBase;
  const surcharge = BNZ.__lastSurcharge || 0;
  const ahFee = BNZ.__lastAhFee || 0;
  const mgFee = BNZ.getMGFee();
  const vehicle = BNZ.selectedVehicle || getVehicleFromUI();

  const finalTotal = BNZ.applyVehicleMultiplier(base + surcharge + ahFee + mgFee, vehicle);

  const priceEl = el.querySelector('.kpi .value.price');
  const totalEl = el.querySelector('.row.total span:last-child');
  if (priceEl) priceEl.textContent = `$${finalTotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${finalTotal.toFixed(2)}`;

  BNZ.__lastQuotedTotal = finalTotal;
  BNZ.__lastVehicle = vehicle;

  applyAirportUiFromPickup(); // reevalúa MG según vehículo/origen
};

/* ------------------ Vehicle toggle + visual ------------------ */
(function wireVehicleToggle(){
  const btns = document.querySelectorAll('.veh-btn');
  if(!btns.length) return;

  const carImg = document.querySelector('.turntable .car');
  const caption = document.querySelector('.vehicle-caption');

  function updateVehicleUI(type){
    if (carImg) {
      if (type === 'van') carImg.src = '/images/van.png';
      else carImg.src = '/images/suburban.png';
    }
    if (caption) {
      caption.textContent = (type === 'van')
        ? 'Van — Up to 12 passengers'
        : 'SUV — Max 5 passengers, 5 suitcases';
    }
    // Ocultar M&G si van
    const mgCard = document.getElementById('meetGreetCard');
    if (mgCard) {
      mgCard.style.display = (type === 'van') ? 'none' : mgCard.style.display;
      if (type === 'van' && BNZ.mgChoice !== 'none') {
        BNZ.mgChoice = 'none';
        const active = mgCard.querySelector('.mg-btn.active');
        if (active) active.classList.remove('active');
        const noneBtn = mgCard.querySelector('.mg-btn[data-choice="none"]');
        if (noneBtn) noneBtn.classList.add('active');
      }
    }
  }

  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.veh-btn').forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
      BNZ.selectedVehicle = btn.dataset.type || 'suv';
      updateVehicleUI(BNZ.selectedVehicle);
      BNZ.recalcFromCache?.();
    });
  });

  // init visual por si ya hay activo
  updateVehicleUI(getVehicleFromUI());
})();

/* ------------------ Términos & botones ------------------ */
const acceptPill = document.getElementById('acceptPill');
const calcBtn = document.getElementById('calculate');
const payBtn  = document.getElementById('pay');

function isAccepted(){ return acceptPill?.classList.contains('on'); }
function setAcceptedState(on){
  if(!acceptPill) return;
  acceptPill.classList.toggle('on', on);
  acceptPill.setAttribute('aria-checked', on ? 'true' : 'false');
  syncButtons();
}
function syncButtons(){
  const accepted = isAccepted();
  if(calcBtn) calcBtn.disabled = !accepted;

  const readyPay = !!BNZ.__lastQuotedTotal && accepted;
  if(payBtn){
    payBtn.disabled = !readyPay;
    payBtn.style.display = 'block';
    payBtn.style.opacity = readyPay ? 1 : .5;
    payBtn.style.cursor = readyPay ? 'pointer' : 'not-allowed';
  }
}
acceptPill?.addEventListener('click', ()=> setAcceptedState(!isAccepted()));
acceptPill?.addEventListener('keydown', (e)=>{
  if(e.key===' '||e.key==='Enter'){ e.preventDefault(); setAcceptedState(!isAccepted()); }
});

/* ------------ Modal Términos (abrir/cerrar) ------------- */
(function wireTermsModal(){
  const openBtn = document.getElementById('openTermsModal');
  const closeBtn = document.getElementById('closeTerms');
  const backdrop = document.getElementById('termsModal');

  if (!backdrop) return;

  function open(){ backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden','false'); }
  function close(){ backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden','true'); }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', (e)=>{ if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && backdrop.classList.contains('open')) close(); });
})();

/* ------------------ Luggage accordion ------------------ */
document.querySelectorAll(".luggage-accordion").forEach(acc=>{
  const sum = acc.querySelector(".luggage-summary");
  sum?.addEventListener("click",()=> acc.classList.toggle("open"));
});

/* ------------------ Botón Calculate ------------------ */
calcBtn?.addEventListener('click', ()=>{
  if(!isAccepted()){
    alert("Please accept Terms & Conditions first.");
    return;
  }

  // Validar que el select tenga una hora
  const sel = document.getElementById('time');
  if (sel && !sel.value) {
    const errEl = document.getElementById('timeError');
    if (errEl) { errEl.style.display='block'; errEl.textContent='Please select a time.'; }
    sel.focus();
    return;
  } else {
    const errEl = document.getElementById('timeError');
    if (errEl) { errEl.style.display='none'; errEl.textContent=''; }
  }

  document.dispatchEvent(new CustomEvent('bnz:calculate'));
});

/* ------------------ Aeropuerto/JSX/FBO ------------------ */
function detectPickupType(text){
  const t = (text || "").toLowerCase();
  const has = (arr)=> arr.some(k=> t.includes(k));
  const isCommercial = has(COMMERCIAL_KEYS);
  const isJsx = has(JSX_KEYS);
  const isFbo = has(FBO_KEYS);
  let type = "NONE";
  if (isJsx) type = "JSX";
  else if (isFbo) type = "FBO";
  else if (isCommercial) type = "COMMERCIAL";
  const isSLC = t.includes("slc") || t.includes("salt lake city");
  return { type, isSLC };
}
function applyAirportUi(result){
  const flightBox = document.getElementById("flightContainer");
  const privateBox = document.getElementById("privateFlightContainer");
  const jsxBox = document.getElementById("jsxContainer");
  const mgCard = document.getElementById("meetGreetCard");

  const vehicle = BNZ.selectedVehicle || getVehicleFromUI();
  const showMG = (result.type === "COMMERCIAL") && result.isSLC && vehicle === "suv";

  if (flightBox)  flightBox.style.display  = (result.type === "COMMERCIAL") ? "block" : "none";
  if (jsxBox)     jsxBox.style.display     = (result.type === "JSX")        ? "block" : "none";
  if (privateBox) privateBox.style.display = (result.type === "FBO")        ? "block" : "none";

  if (mgCard) {
    mgCard.style.display = showMG ? "block" : "none";
    if (!showMG) {
      BNZ.mgChoice = "none";
      const active = mgCard.querySelector(".mg-btn.active");
      if (active) active.classList.remove("active");
      const noneBtn = mgCard.querySelector('.mg-btn[data-choice="none"]');
      if (noneBtn) noneBtn.classList.add("active");
      BNZ.recalcFromCache?.();
    }
  }
}
function applyAirportUiFromPickup(){
  const pickupInput = document.getElementById("pickup");
  if (!pickupInput) return;
  const res = detectPickupType(pickupInput.value || "");
  applyAirportUi(res);
}
(function watchPickupField(){
  const pickup = document.getElementById("pickup");
  if (!pickup) return;
  ["input","change","blur"].forEach(ev=>{ pickup.addEventListener(ev, applyAirportUiFromPickup); });
})();
BNZ.onPickupPlaceChanged = function(place){
  const text = (place && (place.formatted_address || place.name)) || document.getElementById("pickup")?.value || "";
  const res = detectPickupType(text);
  applyAirportUi(res);
};

/* ------------------ Init ------------------ */
(function initBooking(){
  buildTimeOptions();          // llena el <select id="time">
  syncButtons();
  applyAirportUiFromPickup();
})();

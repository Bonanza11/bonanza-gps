/* =========================================================
   Archivo: /public/app/scripts/booking.js
   Propósito:
     - Pricing/UI del flujo de booking (sin lógica de ruta).
     - Total = base + surcharge + after-hours (25%) + Meet&Greet,
       con multiplicador por vehículo.
     - Toggle de Términos, acordeón de equipaje, recálculo “en vivo”.
     - Reglas de Aeropuertos/JSX/FBO según texto del Pick-up.
   Cómo se integra:
     - maps.js calcula la ruta y luego llama:
         BNZ.renderQuote(leg, { surcharge })
       (leg = route leg de Google, con distance/duration)
     - Si usas Autocomplete, en place_changed puedes hacer:
         BNZ.onPickupPlaceChanged(place)
   ========================================================= */

window.BNZ = window.BNZ || {};

/* ------------------ Config & Constantes ------------------ */

// Horario operativo (aplica para BNZ.isAfterHours)
// ⏰ De 7:00 AM a 10:30 PM
BNZ.OPERATING_START = "07:00";   // 7 AM
BNZ.OPERATING_END   = "22:30";   // 10:30 PM

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

BNZ.isAfterHours = (dateStr, timeStr)=>{
  if(!dateStr || !timeStr) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  const [sh,sm] = BNZ.OPERATING_START.split(':').map(Number);
  const [eh,em] = BNZ.OPERATING_END.split(':').map(Number);
  const start = new Date(d); start.setHours(sh, sm, 0, 0);
  const end   = new Date(d); end.setHours(eh, em, 0, 0);
  return (d < start) || (d > end);
};

/* ------------------ Render del resumen ------------------ */

BNZ.__lastBase = null;
BNZ.__lastSurcharge = 0;
BNZ.__lastAhFee = 0;
BNZ.__lastDistanceMiles = 0;
BNZ.__lastDurationText = '';
BNZ.__lastVehicle = 'suv';
BNZ.__lastQuotedTotal = 0;

BNZ.renderQuote = function(leg, opts={}){
  if(!leg || !leg.distance || !leg.duration){
    alert("Route not ready. Please select valid addresses and try again.");
    return;
  }

  const miles = leg.distance.value / 1609.34;
  const basePrice = BNZ.calculateBase(miles);
  const surcharge = Number(opts.surcharge || 0);

  const dateStr = document.getElementById('date')?.value || '';
  const timeStr = document.getElementById('time')?.value || '';
  const afterHours = BNZ.isAfterHours(dateStr, timeStr);
  const ahFee = afterHours ? (basePrice + surcharge) * BNZ.AFTER_HOURS_PCT : 0;
  const mgFee = BNZ.getMGFee();
  const vehicle = BNZ.selectedVehicle || getVehicleFromUI();

  const finalTotal = BNZ.applyVehicleMultiplier(basePrice + surcharge + ahFee + mgFee, vehicle);
  const hasExtra = (surcharge > 0) || (ahFee > 0) || (mgFee > 0);

  // Cache
  BNZ.__lastBase = basePrice;
  BNZ.__lastSurcharge = surcharge;
  BNZ.__lastAhFee = ahFee;
  BNZ.__lastDistanceMiles = miles;
  BNZ.__lastDurationText = leg.duration.text || '';
  BNZ.__lastVehicle = vehicle;
  BNZ.__lastQuotedTotal = finalTotal;

  const el = document.getElementById('info');
  if(!el) return;
  el.style.display = "block";
  el.innerHTML = `
    <h3 class="info-title">Trip Summary</h3>
    <div class="kpis">
      <div class="kpi">
        <div class="label">Distance</div>
        <div class="value">${miles.toFixed(1)}<span class="unit">mi</span></div>
      </div>
      <div class="kpi">
        <div class="label">Duration</div>
        <div class="value">${leg.duration.text}</div>
      </div>
      <div class="kpi">
        <div class="label">Price</div>
        <div class="value price">$${finalTotal.toFixed(2)}</div>
      </div>
    </div>
    ${hasExtra ? `
      <div class="divider"></div>
      <div class="breakdown">
        ${surcharge > 0 ? `<div class="row"><span>Distance Surcharge</span><span>$${surcharge.toFixed(2)}</span></div>` : ''}
        ${ahFee > 0 ? `<div class="row"><span>After-Hours Fee (${Math.round(BNZ.AFTER_HOURS_PCT*100)}%)</span><span>$${ahFee.toFixed(2)}</span></div>` : ''}
        ${mgFee > 0 ? `<div class="row"><span>Meet & Greet (SLC)</span><span>$${mgFee.toFixed(2)}</span></div>` : ''}
        <div class="row total"><span>Total</span><span>$${finalTotal.toFixed(2)}</span></div>
        <div class="tax-note">Taxes & gratuity included</div>
      </div>
    ` : `
      <div class="breakdown">
        <div class="row total"><span>Total</span><span>$${finalTotal.toFixed(2)}</span></div>
        <div class="tax-note">Taxes & gratuity included</div>
      </div>
    `}
  `;

  // Habilitar PAY si los términos están aceptados
  syncButtons();
};

// Recalcular por cambio de vehículo/M&G manteniendo cache
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

  applyAirportUiFromPickup();
};

/* ------------------ Vehicle toggle (UI) ------------------ */
(function wireVehicleToggle(){
  const btns = document.querySelectorAll('.veh-btn');
  if(!btns.length) return;

  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.veh-btn').forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
      BNZ.selectedVehicle = btn.dataset.type || 'suv';
      BNZ.recalcFromCache?.();
    });
  });
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
  if(e.key===' '||e.key==='Enter'){
    e.preventDefault();
    setAcceptedState(!isAccepted());
  }
});

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
  document.dispatchEvent(new CustomEvent('bnz:calculate'));
});

/* ------------------ Detección Aeropuerto/JSX/FBO ------------------ */

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
  ["input","change","blur"].forEach(ev=>{
    pickup.addEventListener(ev, applyAirportUiFromPickup);
  });
})();

BNZ.onPickupPlaceChanged = function(place){
  const text =
    (place && (place.formatted_address || place.name)) ||
    document.getElementById("pickup")?.value || "";
  const res = detectPickupType(text);
  applyAirportUi(res);
};

/* ------------------ Init ------------------ */
(function initBooking(){
  syncButtons();
  applyAirportUiFromPickup();
})();

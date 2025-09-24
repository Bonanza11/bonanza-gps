/* =========================================================
   Archivo: /public/app/scripts/booking.js
   Propósito:
     - Pricing/UI del flujo de booking (sin lógica de Google Maps).
     - Calcula total: base + recargo distancia (opcional) + after-hours (25%)
       + Meet & Greet + multiplicador por vehículo.
     - Toggle de Términos & Condiciones.
     - Acordeón de equipaje.
     - Expone helpers que puede usar maps.js (no acopla al mapa).

   Cómo encaja con el resto:
     - maps.js debe encargarse de la ruta con Google Maps y luego llamar a:
         BNZ.renderQuote(leg, { surcharge })
       donde:
         * leg es el “route leg” de Google (con distance y duration)
         * surcharge es opcional (recargo por distancia/condado). Si no lo pasas, se asume 0.
     - stripe.js lee BNZ.__lastQuotedTotal para crear el Checkout.
     - Este archivo no usa APIs externas ni hace fetch.

   Cambios clave:
     - AFTER_HOURS_PCT = 0.25  (antes 0.20).
     - Función BNZ.isAfterHours(dateStr, timeStr) con fallback 06:00–23:00.
     - Re-cálculo al cambiar vehículo o Meet & Greet sin perder el resumen.

   Dependencias en el DOM (IDs ya presentes en tu index.html):
     - Botones vehículo: .veh-btn[data-type="suv|van"]
     - Card Meet&Greet: #meetGreetCard con .mg-btn[data-choice]
     - Botón Calcular: #calculate
     - Botón Pay: #pay
     - Campos: #date, #time
     - Contenedor resumen: #info
     - Toggle términos: #acceptPill

   ========================================================= */

window.BNZ = window.BNZ || {};

/* ------------------ Config & Constantes ------------------ */

// Horario operativo (fallback). Si core.js define otros, se respetan allí.
BNZ.OPERATING_START = BNZ.OPERATING_START || "06:00";
BNZ.OPERATING_END   = BNZ.OPERATING_END   || "23:00";

// 👇 After-hours al 25%
BNZ.AFTER_HOURS_PCT = 0.25;

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

// Wire de botones M&G
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
  const [sh,sm] = (BNZ.OPERATING_START || "06:00").split(':').map(Number);
  const [eh,em] = (BNZ.OPERATING_END   || "23:00").split(':').map(Number);
  const start = new Date(d); start.setHours(sh, sm, 0, 0);
  const end   = new Date(d); end.setHours(eh, em, 0, 0);
  return (d < start) || (d > end);
};

/* ------------------ Render del resumen ------------------ */
/* maps.js debe llamar a BNZ.renderQuote(leg, { surcharge }) tras calcular la ruta. */

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

  // Guardamos “cache” para recálculo
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

// Recalcular solo por cambio de vehículo/M&G manteniendo cache
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
/* Dispara un evento para que maps.js calcule la ruta (si lo estás escuchando).
   Si no usas evento, puedes hacer que maps.js asigne BNZ.routeAndQuote y llamarla aquí. */

calcBtn?.addEventListener('click', ()=>{
  if(!isAccepted()){
    alert("Please accept Terms & Conditions first.");
    return;
  }
  // Lanza evento global que maps.js puede escuchar para iniciar el cálculo de ruta.
  document.dispatchEvent(new CustomEvent('bnz:calculate'));
});

/* ------------------ Init del módulo ------------------ */
(function initBooking(){
  // Arranca el estado de botones en función del switch de T&C
  syncButtons();
})();

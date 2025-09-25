/* =========================================================
   Archivo: /public/app/scripts/booking.js
   Descripción:
   - Manejo de formulario Bonanza (validaciones, Meet&Greet,
     vehículo, Terms, cálculo de precios, Stripe).
   ========================================================= */

window.BNZ = {
  pickup: null,
  dropoff: null,
  distance: 0,
  duration: 0,
  price: 0,
  vehicle: 'suv',       // default
  mgChoice: 'none',     // Meet & Greet
  cache: {},            // datos en memoria
  selectedVehicle: 'suv'
};

/* ================= VALIDACIONES ================= */

function validateEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePhone(phone){
  return /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(phone);
}
function validateTimeValue(val){
  if(!val) return false;
  return /^([1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i.test(val.trim());
}

/* Wire email/phone hints */
function wireValidators(){
  const emailEl = document.getElementById('email');
  const emailHelp = document.getElementById('emailHelp');
  emailEl.addEventListener('input', ()=>{
    if(validateEmail(emailEl.value)){
      emailEl.classList.add('valid'); emailEl.classList.remove('invalid');
      emailHelp.textContent = 'Valid email'; emailHelp.className = 'hint ok';
    } else {
      emailEl.classList.add('invalid'); emailEl.classList.remove('valid');
      emailHelp.textContent = 'Invalid email'; emailHelp.className = 'hint err';
    }
  });

  const phoneEl = document.getElementById('phone');
  const phoneHelp = document.getElementById('phoneHelp');
  phoneEl.addEventListener('input', ()=>{
    if(validatePhone(phoneEl.value)){
      phoneEl.classList.add('valid'); phoneEl.classList.remove('invalid');
      phoneHelp.textContent = 'Valid US phone'; phoneHelp.className = 'hint ok';
    } else {
      phoneEl.classList.add('invalid'); phoneEl.classList.remove('valid');
      phoneHelp.textContent = 'Invalid phone'; phoneHelp.className = 'hint err';
    }
  });
}

/* ================= TIME COMBO (scroll interno) ================= */
(function wireTimeCombo(){
  const combo  = document.getElementById('timeCombo');
  const input  = document.getElementById('time');
  const caret  = combo?.querySelector('.time-caret');
  const panel  = document.getElementById('timePanel');
  if (!combo || !input || !panel) return;

  function buildTimes(){
    panel.innerHTML = '';
    const startMin = 7*60;        // 7:00 AM
    const endMin   = 22*60 + 30;  // 10:30 PM
    for(let m = startMin; m <= endMin; m += 15){
      const h24 = Math.floor(m/60);
      const mm  = m % 60;
      let h12 = h24 % 12; if (h12===0) h12=12;
      const ap = (h24<12 ? 'AM' : 'PM');
      const label = `${h12}:${String(mm).padStart(2,'0')} ${ap}`;

      const opt = document.createElement('div');
      opt.className = 'time-opt';
      opt.setAttribute('role','option');
      opt.textContent = label;

      opt.addEventListener('click', ()=>{
        input.value = label;
        const errEl = document.getElementById('timeError');
        if (errEl) { errEl.style.display='none'; errEl.textContent=''; }
        input.classList.remove('field-invalid','invalid');
        closePanel();
      });

      panel.appendChild(opt);
    }
  }

  function openPanel(){
    buildTimes();
    panel.classList.add('open');
    input.setAttribute('aria-expanded','true');
  }
  function closePanel(){
    panel.classList.remove('open');
    input.setAttribute('aria-expanded','false');
  }
  function togglePanel(){ panel.classList.contains('open') ? closePanel() : openPanel(); }

  input.addEventListener('click', togglePanel);
  caret.addEventListener('click', togglePanel);
  document.addEventListener('click', (e)=>{ if (!combo.contains(e.target)) closePanel(); });
  combo.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') { closePanel(); input.blur(); }
    if (e.key === 'Enter' && !panel.classList.contains('open')) { openPanel(); }
  });
})();

/* ================= VEHICLE TOGGLE ================= */
function wireVehicleToggle(){
  const btns = document.querySelectorAll('.veh-btn');
  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      btns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      BNZ.selectedVehicle = btn.dataset.type;

      // Cambiar imagen
      const img = document.querySelector('.turntable .car');
      const caption = document.querySelector('.vehicle-caption');
      if(BNZ.selectedVehicle === 'van'){
        img.src = '/images/van-sprinter.png';
        caption.textContent = 'Van — Up to 12 passengers';
      } else {
        img.src = '/images/suburban.png';
        caption.textContent = 'SUV — Max 5 passengers, 5 suitcases';
      }

      BNZ.recalcFromCache?.();
    });
  });
}

/* ================= MEET & GREET ================= */
function wireMeetGreet(){
  const mgBtns = document.querySelectorAll('.mg-btn');
  mgBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mgBtns.forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
      BNZ.mgChoice = btn.dataset.choice;
      BNZ.recalcFromCache?.();
    });
  });
}

/* ================= TERMS ================= */
function wireTerms(){
  const pill = document.getElementById('acceptPill');
  const calcBtn = document.getElementById('calculate');
  if(!pill) return;

  function update(){
    const on = pill.classList.contains('on');
    calcBtn.disabled = !on;
  }

  pill.addEventListener('click', ()=>{
    pill.classList.toggle('on');
    update();
  });
  pill.addEventListener('keydown', e=>{
    if(e.key==='Enter'||e.key===' '){
      pill.classList.toggle('on');
      update();
    }
  });
  update();
}

/* ================= PRICE CALCULATION ================= */
BNZ.recalcFromCache = function(){
  // Simulación simple con base en distancia y vehículo
  const miles = BNZ.distance || 10;
  let price = 0;
  if(miles<=10) price=120;
  else if(miles<=35) price=190;
  else if(miles<=39) price=210;
  else if(miles<=48) price=230;
  else if(miles<=55) price=250;
  else price = miles*5.4;

  if(BNZ.selectedVehicle==='van') price += 60;
  if(BNZ.mgChoice!=='none' && BNZ.selectedVehicle==='suv') price += 50;

  BNZ.price = price;
  renderSummary();
};

function renderSummary(){
  const info = document.getElementById('info');
  if(!info) return;
  info.style.display = 'block';
  info.innerHTML = `
    <div class="info-title">Trip Summary</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Distance</div><div class="value">${BNZ.distance.toFixed(1)}<span class="unit">mi</span></div></div>
      <div class="kpi"><div class="label">Duration</div><div class="value">${BNZ.duration.toFixed(0)}<span class="unit">min</span></div></div>
      <div class="kpi"><div class="label">Price</div><div class="value price">$${BNZ.price.toFixed(2)}</div></div>
    </div>
  `;
}

/* ================= INIT ================= */
function initBooking(){
  wireValidators();
  wireVehicleToggle();
  wireMeetGreet();
  wireTerms();
}

document.addEventListener('DOMContentLoaded', initBooking);

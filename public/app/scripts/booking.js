/* =========================================================
   Booking UI logic (validators, Meet&Greet, vehicle, terms,
   time combo scroll, summary render)
   ========================================================= */

window.BNZ = window.BNZ || {};
BNZ.selectedVehicle = BNZ.selectedVehicle || 'suv';
BNZ.mgChoice = BNZ.mgChoice || 'none';
BNZ.distance = BNZ.distance || 10;   // demo value until route sets it
BNZ.duration = BNZ.duration || 25;

/* ---------------- Validators (email/phone) ---------------- */
function validateEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validatePhone(phone){ return /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(phone); }

function wireValidators(){
  const emailEl = document.getElementById('email');
  const emailHelp = document.getElementById('emailHelp');
  if (emailEl && emailHelp){
    emailEl.addEventListener('input', ()=>{
      if(validateEmail(emailEl.value)){ emailEl.classList.add('valid'); emailEl.classList.remove('invalid'); emailHelp.textContent='Valid email'; emailHelp.className='hint ok'; }
      else { emailEl.classList.add('invalid'); emailEl.classList.remove('valid'); emailHelp.textContent='Invalid email'; emailHelp.className='hint err'; }
    });
  }
  const phoneEl = document.getElementById('phone');
  const phoneHelp = document.getElementById('phoneHelp');
  if (phoneEl && phoneHelp){
    phoneEl.addEventListener('input', ()=>{
      if(validatePhone(phoneEl.value)){ phoneEl.classList.add('valid'); phoneEl.classList.remove('invalid'); phoneHelp.textContent='Valid US phone'; phoneHelp.className='hint ok'; }
      else { phoneEl.classList.add('invalid'); phoneEl.classList.remove('valid'); phoneHelp.textContent='Invalid phone'; phoneHelp.className='hint err'; }
    });
  }
}

/* ---------------- Time combo (single field + scroll) ---------------- */
function buildTimeOptions(panel){
  panel.innerHTML = '';
  const start = 7*60, end = 22*60 + 30; // 7:00 AM -> 10:30 PM
  for(let m = start; m <= end; m += 15){
    const h24 = Math.floor(m/60), mm = String(m%60).padStart(2,'0');
    let h12 = h24 % 12; if(h12===0) h12=12;
    const ap = h24<12?'AM':'PM';
    const label = `${h12}:${mm} ${ap}`;
    const opt = document.createElement('div');
    opt.className = 'time-opt';
    opt.setAttribute('role','option');
    opt.textContent = label;
    opt.addEventListener('click', ()=>{
      const input = document.getElementById('time');
      input.value = label;
      input.setAttribute('aria-expanded','false');
      panel.classList.remove('open');
      const errEl = document.getElementById('timeError');
      if (errEl){ errEl.style.display='none'; errEl.textContent=''; }
    });
    panel.appendChild(opt);
  }
}
function wireTimeCombo(){
  const combo = document.getElementById('timeCombo');
  const input = document.getElementById('time');
  const caret = combo ? combo.querySelector('.time-caret') : null;
  const panel = document.getElementById('timePanel');
  if(!combo || !input || !panel) return;

  const open = ()=>{ buildTimeOptions(panel); panel.classList.add('open'); input.setAttribute('aria-expanded','true'); };
  const close = ()=>{ panel.classList.remove('open'); input.setAttribute('aria-expanded','false'); };
  const toggle = ()=> panel.classList.contains('open') ? close() : open();

  input.addEventListener('click', toggle);
  caret?.addEventListener('click', toggle);
  document.addEventListener('click', (e)=>{ if (!combo.contains(e.target)) close(); });
  combo.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); if(e.key==='Enter' && !panel.classList.contains('open')) open(); });
}

/* ---------------- Vehicle toggle ---------------- */
function wireVehicleToggle(){
  const btns = document.querySelectorAll('.veh-btn');
  if(!btns.length) return;
  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      btns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      BNZ.selectedVehicle = btn.dataset.type;

      // change image + caption
      const img = document.querySelector('.turntable .car');
      const caption = document.querySelector('.vehicle-caption');
      if (BNZ.selectedVehicle === 'van'){
        if (img) img.src = '/images/van-sprinter.png';
        if (caption) caption.textContent = 'Van — Up to 12 passengers';
      } else {
        if (img) img.src = '/images/suburban.png';
        if (caption) caption.textContent = 'SUV — Max 5 passengers, 5 suitcases';
      }
      BNZ.recalcFromCache?.();
    });
  });
}

/* ---------------- Meet & Greet ---------------- */
function wireMeetGreet(){
  const mgBtns = document.querySelectorAll('.mg-btn');
  if(!mgBtns.length) return;
  mgBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mgBtns.forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
      BNZ.mgChoice = btn.dataset.choice; // 'none' | 'tsa_exit' | 'baggage_claim'
      BNZ.recalcFromCache?.();
    });
  });
}

/* ---------------- Terms (switch + modal) ---------------- */
function wireTerms(){
  const pill = document.getElementById('acceptPill');
  const calcBtn = document.getElementById('calculate');
  const openBtn = document.getElementById('openTermsModal');
  const modal = document.getElementById('termsModal');
  const closeBtn = document.getElementById('closeTerms');

  const update = ()=>{ if(calcBtn && pill) calcBtn.disabled = !pill.classList.contains('on'); };
  pill?.addEventListener('click', ()=>{ pill.classList.toggle('on'); update(); });
  pill?.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pill.classList.toggle('on'); update(); }});
  update();

  const open = ()=> modal?.classList.add('open');
  const close = ()=> modal?.classList.remove('open');
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', e=>{ if(e.target===modal) close(); });
}

/* ---------------- Pricing (simple demo, incluye M&G) ---------------- */
BNZ.recalcFromCache = function(){
  const miles = BNZ.distance || 10;
  let price = 0;
  if(miles<=10) price=120;
  else if(miles<=35) price=190;
  else if(miles<=39) price=210;
  else if(miles<=48) price=230;
  else if(miles<=55) price=250;
  else price = miles * 5.4;

  if(BNZ.selectedVehicle==='van') price = Math.round(price * 1.30); // +30%
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
      <div class="kpi"><div class="label">Distance</div><div class="value">${Number(BNZ.distance||0).toFixed(1)}<span class="unit">mi</span></div></div>
      <div class="kpi"><div class="label">Duration</div><div class="value">${Number(BNZ.duration||0).toFixed(0)}<span class="unit">min</span></div></div>
      <div class="kpi"><div class="label">Price</div><div class="value price">$${BNZ.price.toFixed(2)}</div></div>
    </div>
  `;
}

/* ---------------- Init ---------------- */
function initBooking(){
  wireValidators();
  wireTimeCombo();
  wireVehicleToggle();
  wireMeetGreet();
  wireTerms();
}
document.addEventListener('DOMContentLoaded', initBooking);

/* If your maps.js sets BNZ.distance/duration later, call BNZ.recalcFromCache() after route. */

/* =========================================================================
   ui.js — Bonanza Transportation
   -------------------------------------------------------------------------
   - Maneja el visual del vehículo (SUV/Van).
   - Maneja el acordeón de Luggage Guidelines.
   ======================================================================== */

(function(){
  "use strict";

  // ───────── Visual del vehículo ─────────
  const SUV_IMG = "/images/suburban.png";
  const VAN_IMG = "/images/van-sprinter.png";

  window.__vehicleType = window.__vehicleType || "suv";

  const btns = document.querySelectorAll('.veh-btn');
  const img  = document.getElementById('vehImg');
  const cap  = document.getElementById('vehCap');

  function applyVisual(){
    if(!img || !cap) return;
    if(window.__vehicleType === 'van'){
      img.src = VAN_IMG;
      cap.textContent = "Van — Up to 12 passengers (luggage varies)";
    } else {
      img.src = SUV_IMG;
      cap.textContent = "SUV — Max 5 passengers, 5 suitcases";
    }
  }

  function setActive(type){
    window.__vehicleType = (type === 'van') ? 'van' : 'suv';
    btns.forEach(b => b.classList.toggle('active', b.dataset.type === window.__vehicleType));
    applyVisual();
    if(typeof window.recalcFromCache === 'function'){
      window.recalcFromCache();
    }
  }

  btns.forEach(b => b.addEventListener('click', ()=>setActive(b.dataset.type || 'suv')));

  if(img){
    img.onerror = ()=>{
      img.removeAttribute('src');
      img.alt = window.__vehicleType.toUpperCase();
      img.style.width = '120px'; 
      img.style.height = '80px';
      img.style.background = '#1a1a1a';
      img.style.border = '1px solid #444';
      img.style.borderRadius = '8px';
    };
  }

  setActive(window.__vehicleType);

  // ───────── Acordeón de Luggage ─────────
  const acc = document.getElementById('luggageAccordion');
  const sum = acc?.querySelector('.luggage-summary');
  sum?.addEventListener('click', ()=>acc.classList.toggle('open'));

})();

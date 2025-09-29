/* =========================================================================
   core.js — Bonanza (control general del flujo + botón Calculate)
   Limpio: sin bloqueo por T&C, sin dependencias al switch.
   ======================================================================== */
(function(){
  "use strict";

  const $ = (id)=> document.getElementById(id);

  // Estado global del vehículo (si otro módulo ya lo setea, se respeta)
  window.__vehicleType = window.__vehicleType || 'suv';

  // --- Validaciones ligeras (apoyadas en validators.js si existe)
  function requireFilled(ids){
    let ok = true;
    ids.forEach(id=>{
      const el = $(id);
      const empty = !el || !String(el.value||"").trim();
      if (el) el.classList.toggle('invalid', empty);
      if (empty) ok = false;
    });
    return ok;
  }
  function isEmail(v){
    const V = window.BNZ?.validators;
    return V?.email ? V.email(v) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v||"");
  }
  function isUSPhone(v){
    const V = window.BNZ?.validators;
    return V?.usPhone ? V.usPhone(v) : /^\D*?(\d\D*){10}$/.test(v||"");
  }

  // 24h mínimo (local)
  function atLeast24hAhead(dateStr,timeStr){
    if(!dateStr||!timeStr) return false;
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    return (dt.getTime() - Date.now()) >= 24*60*60*1000;
  }

  // --- Click en Calculate: valida y dispara cálculo (maps.js escucha)
  $('calculate')?.addEventListener('click', (e)=>{
    e.preventDefault();

    const required = ['fullname','phone','email','pickup','dropoff','date','time'];
    if (!requireFilled(required)){ alert('Please complete all required fields.'); return; }
    if (!isEmail($('email')?.value)){ alert('Invalid email.'); return; }
    if (!isUSPhone($('phone')?.value)){ alert('Invalid US phone number.'); return; }
    if (!atLeast24hAhead($('date')?.value, $('time')?.value)){
      alert('Please choose Date & Time at least 24 hours in advance.');
      return;
    }

    // Dispara el cómputo de ruta + presupuesto (maps.js -> BNZ.renderQuote)
    document.dispatchEvent(new CustomEvent('bnz:calculate'));
  });

  // Exponer utilidades mínimas (opcional)
  window.BNZ = window.BNZ || {};
  window.BNZ.recalcFromCache = function(){
    // hook suave por si el visual de vehículo cambia y ya hay quote
    if (window.BNZ?.state?.last?.leg && window.BNZ?.renderQuote) {
      const last = window.BNZ.state.last;
      window.BNZ.renderQuote(last.leg, { surcharge:last.surcharge||0 });
    }
  };
})();

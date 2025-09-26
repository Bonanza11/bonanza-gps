/* =========================================================================
   core.js — Bonanza (términos + habilitar botones + evento calcular)
   ======================================================================== */

(function(){
  "use strict";

  const $  = (id)=> document.getElementById(id);
  const pill = $('acceptPill');
  const btnCalc = $('calculate');
  const btnPay  = $('pay');

  // Estado global del vehículo (si otro módulo ya lo setea, lo respeta)
  window.__vehicleType = window.__vehicleType || 'suv';

  function isAccepted(){ return pill?.classList.contains('on'); }

  function syncButtons(){
    if (btnCalc) btnCalc.disabled = !isAccepted();
    if (btnPay){
      const ready = !!window.__lastQuotedTotal && isAccepted();
      btnPay.disabled = !ready;
      btnPay.style.display = 'block';
      btnPay.style.opacity = ready ? 1 : .5;
      btnPay.style.cursor  = ready ? 'pointer' : 'not-allowed';
    }
  }

  function toggleTerms(on){
    if (!pill) return;
    pill.classList.toggle('on', !!on);
    pill.setAttribute('aria-checked', on ? 'true' : 'false');
    syncButtons();
  }

  // Interacción del “switch”
  pill?.addEventListener('click', ()=> toggleTerms(!isAccepted()));
  pill?.addEventListener('keydown', (e)=>{
    if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggleTerms(!isAccepted()); }
  });

  // Calculate: validaciones mínimas antes de pedir ruta
  $('calculate')?.addEventListener('click', (e)=>{
    e.preventDefault();
    if (!isAccepted()){ alert('Please accept Terms & Conditions first.'); return; }

    const required = ['fullname','phone','email','pickup','dropoff','date','time'];
    const V = window.BNZ?.validators;
    if (!V?.requireFilled(required)){ alert('Please complete all required fields.'); return; }
    if (!V.email($('email').value)){ alert('Invalid email.'); return; }
    if (!V.usPhone($('phone').value)){ alert('Invalid US phone number.'); return; }

    // Dispara el cálculo de ruta (maps.js escucha este evento)
    document.dispatchEvent(new CustomEvent('bnz:calculate'));
  });

  // Exponer para otros módulos
  window.BNZ = window.BNZ || {};
  window.BNZ.syncButtons = syncButtons;

  // boot inicial
  toggleTerms(false); // empieza apagado
})();

/* =========================================================================
   core.js — Bonanza (T&C visuales, sin bloqueo) + evento calcular
   ======================================================================== */

(function(){
  "use strict";

  const $   = (id)=> document.getElementById(id);
  const pill = $('acceptPill');
  const btnCalc = $('calculate');
  const btnPay  = $('pay');

  // Estado global del vehículo (si otro módulo ya lo setea, lo respeta)
  window.__vehicleType = window.__vehicleType || 'suv';

  // ⚠️ Importante: desde ahora SIEMPRE consideramos aceptado para el flujo
  function isAccepted(){ return true; }

  function syncButtons(){
    // Calculate siempre habilitado
    if (btnCalc) btnCalc.disabled = false;

    // PAY NOW se habilita cuando ya existe un total (no depende del pill)
    if (btnPay){
      const ready = !!window.__lastQuotedTotal;
      btnPay.disabled = !ready;
      btnPay.style.display = 'block';
      btnPay.style.opacity = ready ? 1 : .5;
      btnPay.style.cursor  = ready ? 'pointer' : 'not-allowed';
    }
  }

  // Mantener el pill sólo como visual (no afecta el flujo)
  function toggleTerms(on){
    if (!pill) return;
    pill.classList.toggle('on', !!on);
    pill.setAttribute('aria-checked', on ? 'true' : 'false');
    // No bloqueamos nada, sólo sincronizamos por si hay botones en pantalla
    syncButtons();
  }

  // Interacción del “switch” (opcional/visual)
  pill?.addEventListener('click', ()=> toggleTerms(true));
  pill?.addEventListener('keydown', (e)=>{
    if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggleTerms(true); }
  });

  // Calculate: validaciones mínimas y dispara el cálculo de ruta
  $('calculate')?.addEventListener('click', (e)=>{
    e.preventDefault();

    const required = ['fullname','phone','email','pickup','dropoff','date','time'];
    const V = window.BNZ?.validators;

    // Validaciones básicas (sin T&C)
    if (!V?.requireFilled(required)){ alert('Please complete all required fields.'); return; }
    if (!V.email($('email').value)){ alert('Invalid email.'); return; }
    if (!V.usPhone($('phone').value)){ alert('Invalid US phone number.'); return; }

    // Dispara el cálculo de ruta (maps.js escucha este evento y luego booking.js pinta el summary)
    document.dispatchEvent(new CustomEvent('bnz:calculate'));
  });

  // Exponer para otros módulos
  window.BNZ = window.BNZ || {};
  window.BNZ.syncButtons = syncButtons;

  // Boot inicial: dejamos el pill visualmente en ON y botones sincronizados
  toggleTerms(true);
})();

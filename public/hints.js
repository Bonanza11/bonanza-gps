/* =========================================================================
   hints.js — Mensajes de ayuda (email/teléfono) sólo tras interacción
   - No muestra nada al cargar.
   - Muestra rojo si inválido, verde si válido.
   - No toca bordes (CSS ya desactivó bordes rojos nativos).
   ======================================================================== */
(function(){
  "use strict";
  const $ = (id)=>document.getElementById(id);
  const phoneEl = $('phone');
  const emailEl = $('email');
  const phoneHelp = $('phoneHelp');
  const emailHelp = $('emailHelp');

  if(!phoneEl || !emailEl || !phoneHelp || !emailHelp) return;

  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  const usPhoneRx = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/;

  const state = { phoneTouched:false, emailTouched:false };

  function showHint(helpEl, cls, text){
    helpEl.className = 'hint show ' + (cls||'');
    helpEl.textContent = text || '';
  }
  function hideHint(helpEl){
    helpEl.className = 'hint';
    helpEl.textContent = '';
  }

  function onPhoneChange(){
    const raw = String(phoneEl.value||'').trim();
    const hasContent = raw.length>0;
    if(!state.phoneTouched && !hasContent){ hideHint(phoneHelp); return; }
    const ok = usPhoneRx.test(raw);
    showHint(phoneHelp, ok?'ok':'err', ok ? 'Valid US phone' : 'Enter a valid US number');
  }
  function onEmailChange(){
    const raw = String(emailEl.value||'').trim();
    const hasContent = raw.length>0;
    if(!state.emailTouched && !hasContent){ hideHint(emailHelp); return; }
    const ok = emailRx.test(raw);
    showHint(emailHelp, ok?'ok':'err', ok ? 'Valid email' : 'Please enter a valid email (e.g., name@domain.com)');
  }

  phoneEl.addEventListener('blur', ()=>{ state.phoneTouched=true; onPhoneChange(); });
  emailEl.addEventListener('blur', ()=>{ state.emailTouched=true; onEmailChange(); });
  phoneEl.addEventListener('input', onPhoneChange);
  emailEl.addEventListener('input', onEmailChange);

  // Inicio limpio: nada visible
  hideHint(phoneHelp); 
  hideHint(emailHelp);
})();

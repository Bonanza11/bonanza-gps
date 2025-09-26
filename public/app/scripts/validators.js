            /* validators.js — email / phone con hints diferidos (touched) */
(function(){
  "use strict";

  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  const usPhoneRx = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/;

  const $ = (id)=> document.getElementById(id);

  // Helpers para hints
  function showHint(el, type, text){
    if(!el) return;
    el.className = 'hint show ' + (type||'');
    el.textContent = text||'';
  }
  function hideHint(el){
    if(!el) return;
    el.className = 'hint';
    el.textContent = '';
  }

  // Email
  (function wireEmail(){
    const input = $('email');
    const help  = $('emailHelp');
    if(!input) return;

    const state = { touched:false };

    const isValid = (v)=> emailRx.test(String(v||'').trim());

    function evalEmail(){
      const v = input.value || '';
      const touchedOrFilled = state.touched || v.trim().length>0;
      if(!touchedOrFilled){ hideHint(help); return; }
      if(isValid(v)){ showHint(help,'ok','Valid email'); }
      else{ showHint(help,'err','Please enter a valid email (e.g., name@domain.com)'); }
    }

    input.addEventListener('blur', ()=>{ state.touched=true; evalEmail(); });
    input.addEventListener('input', evalEmail);

    hideHint(help); // inicio limpio
  })();

  // Phone
  (function wirePhone(){
    const input = $('phone');
    const help  = $('phoneHelp');
    if(!input) return;

    const state = { touched:false };

    function formatUS(digits){
      let d = digits.replace(/\D/g,'');
      if (d.startsWith('1')) d = d.slice(1);
      d = d.slice(0,10);
      const a=d.slice(0,3), b=d.slice(3,6), c=d.slice(6,10);
      if(d.length>6) return `(${a}) ${b}-${c}`;
      if(d.length>3) return `(${a}) ${b}`;
      if(d.length>0) return `(${a}`;
      return '';
    }

    function evalPhone(){
      const raw = String(input.value||'');
      const digits = raw.replace(/\D/g,'').slice(0,11);
      input.value = formatUS(digits);

      const ok = usPhoneRx.test(raw) || usPhoneRx.test(input.value);
      const touchedOrFilled = state.touched || input.value.trim().length>0;
      if(!touchedOrFilled){ hideHint(help); return; }
      if(ok){ showHint(help,'ok','Valid US phone'); }
      else{ showHint(help,'err','Enter a valid US number'); }
    }

    input.addEventListener('blur', ()=>{ state.touched=true; evalPhone(); });
    input.addEventListener('input', evalPhone);

    hideHint(help);
  })();

  // Exponer utilidades si las usa core.js/booking.js
  window.BNZ = window.BNZ || {};
  window.BNZ.validators = {
    email: (v)=>emailRx.test(String(v||'').trim()),
    usPhone: (v)=>usPhoneRx.test(String(v||'').trim()),
    requireFilled(ids){
      let ok = true;
      (ids||[]).forEach(id=>{
        const el = $(id);
        const bad = !el || !String(el.value||'').trim();
        if (el) el.classList.toggle('invalid', bad); // no pinta rojo (CSS la neutraliza)
        if (bad) ok = false;
      });
      return ok;
    }
  };
})();

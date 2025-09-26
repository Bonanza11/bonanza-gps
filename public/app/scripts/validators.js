/* =========================================================================
   validators.js — Bonanza (email, teléfono US, campos requeridos)
   ======================================================================== */

(function(){
  "use strict";

  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  const usPhoneRx = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/;

  function $(id){ return document.getElementById(id); }
  function setInvalid(el, bad){
    if(!el) return;
    el.classList.toggle('invalid', !!bad);
  }

  // Email “en vivo”
  (function wireEmail(){
    const input = $('email');
    const help  = $('emailHelp');
    if(!input) return;

    function update(){
      const v = String(input.value||'').trim();
      const ok = emailRx.test(v);
      setInvalid(input, !ok);
      if (help){
        help.textContent = ok ? 'Valid email' : 'Please enter a valid email (e.g., name@domain.com)';
        help.style.color = ok ? '#17c964' : '#ff6b6b';
      }
    }
    input.addEventListener('input', update);
    input.addEventListener('blur',  update);
    update();
  })();

  // Teléfono US (formatea y valida)
  (function wirePhone(){
    const input = $('phone');
    const help  = $('phoneHelp');
    if(!input) return;

    function formatUS(digits){
      let d = digits.replace(/\D/g,'');
      if (d.startsWith('1')) d = d.slice(1); // quita “1” si vino con +1
      d = d.slice(0,10);
      const a=d.slice(0,3), b=d.slice(3,6), c=d.slice(6,10);
      if(d.length>6) return `(${a}) ${b}-${c}`;
      if(d.length>3) return `(${a}) ${b}`;
      if(d.length>0) return `(${a}`;
      return '';
    }

    function update(){
      const raw = String(input.value||'');
      const digits = raw.replace(/\D/g,'').slice(0,11);
      // set pretty
      input.value = formatUS(digits);

      const ok = usPhoneRx.test(raw) || usPhoneRx.test(input.value);
      setInvalid(input, !ok);
      if (help){
        help.textContent = ok ? 'Valid US phone' : 'Enter a valid US number';
        help.style.color = ok ? '#17c964' : '#ff6b6b';
      }
    }

    input.addEventListener('input', update);
    input.addEventListener('blur',  update);
    update();
  })();

  // Utilidad común
  window.BNZ = window.BNZ || {};
  window.BNZ.validators = {
    email: (v)=>emailRx.test(String(v||'').trim()),
    usPhone: (v)=>usPhoneRx.test(String(v||'').trim()),
    requireFilled(ids){
      let ok = true;
      (ids||[]).forEach(id=>{
        const el = $(id);
        const bad = !el || !String(el.value||'').trim();
        setInvalid(el, bad);
        if (bad) ok = false;
      });
      return ok;
    }
  };
})();

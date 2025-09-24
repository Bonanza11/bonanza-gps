/* =========================================================
   Archivo: /public/app/scripts/validators.js
   Rol:
     - Validación en vivo de Teléfono (EE. UU.) y Email.
     - Pinta .valid (verde) si OK y .invalid (rojo) si no.
     - Actualiza los hints #phoneHelp y #emailHelp.
   ========================================================= */

(function(){
  const $ = (id)=> document.getElementById(id);

  /* ---------- Email ---------- */
  function validateEmail(v){
    const val = (v||'').trim();
    const basic = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/.test(val);
    if(!basic) return {ok:false, msg:'Please enter a valid email, e.g., name@domain.com'};
    if(/\.\./.test(val)) return {ok:false, msg:'Email cannot contain consecutive dots'};
    const typos = [/@gmal\.com$/i, /@gmial\.com$/i, /@hotnail\.com$/i, /@yaho\.com$/i];
    if(typos.some(rx=>rx.test(val))) return {ok:false,msg:'Please correct the domain spelling (e.g., @gmail.com)'};
    return {ok:true, msg:'Valid email'};
  }

  function wireEmail(){
    const input = $('email');
    const help  = $('emailHelp');
    if(!input) return;

    const setState = (ok, msg)=>{
      input.setCustomValidity(ok? '' : msg);
      input.classList.toggle('valid', ok);
      input.classList.toggle('invalid', !ok && input.value.trim().length>0);
      if(help){
        help.textContent = msg;
        help.className = 'hint ' + (ok ? 'ok' : 'err');
      }
    };

    input.addEventListener('input', ()=>{
      const r = validateEmail(input.value);
      // Si está vacío, limpia estado visual
      if(!input.value.trim()){
        input.classList.remove('valid','invalid');
        if(help){ help.textContent=''; help.className='hint'; }
        input.setCustomValidity('');
        return;
      }
      setState(r.ok, r.ok ? 'Valid email' : r.msg);
    });

    input.addEventListener('blur', ()=>{
      const r = validateEmail(input.value);
      if(!input.value.trim()){
        input.classList.remove('valid','invalid');
        if(help){ help.textContent=''; help.className='hint'; }
        input.setCustomValidity('');
        return;
      }
      setState(r.ok, r.ok ? 'Valid email' : r.msg);
    });
  }

  /* ---------- Teléfono (EE. UU. NANP) ---------- */
  function formatUS(digits){
    if(digits.startsWith('1')) digits = digits.slice(1);
    digits = digits.slice(0,10);
    const a = digits.slice(0,3), b = digits.slice(3,6), c = digits.slice(6,10);
    if(digits.length > 6) return `(${a}) ${b}-${c}`;
    if(digits.length > 3) return `(${a}) ${b}`;
    if(digits.length > 0) return `(${a}`;
    return '';
  }
  function validateNANP(digits){
    // Permite 11 iniciando en 1 y lo recorta
    if(digits.length===11 && digits.startsWith('1')) digits = digits.slice(1);
    if(digits.length!==10) return {ok:false,msg:'Enter a 10-digit US number'};
    if(!/^[2-9]/.test(digits[0])) return {ok:false,msg:'Area code must start 2–9'};
    if(!/^[2-9]/.test(digits[3])) return {ok:false,msg:'Exchange must start 2–9'};
    return {ok:true,msg:'Valid US number'};
  }

  function wirePhone(){
    const input = $('phone');
    const help  = $('phoneHelp');
    if(!input) return;

    const setState = (ok, msg)=>{
      input.setCustomValidity(ok? '' : msg);
      input.classList.toggle('valid', ok);
      input.classList.toggle('invalid', !ok && input.value.trim().length>0);
      if(help){
        help.textContent = msg;
        help.className = 'hint ' + (ok ? 'ok' : 'err');
      }
    };

    input.addEventListener('input', ()=>{
      const digits = input.value.replace(/\D/g,'').slice(0,11); // acepta “1” al inicio
      input.value = formatUS(digits);
      if(!digits){
        input.classList.remove('valid','invalid');
        if(help){ help.textContent=''; help.className='hint'; }
        input.setCustomValidity('');
        return;
      }
      const r = validateNANP(digits);
      setState(r.ok, r.ok ? 'Valid US number' : r.msg);
    });

    input.addEventListener('blur', ()=>{
      const digits = input.value.replace(/\D/g,'');
      if(!digits){
        input.classList.remove('valid','invalid');
        if(help){ help.textContent=''; help.className='hint'; }
        input.setCustomValidity('');
        return;
      }
      const r = validateNANP(digits);
      setState(r.ok, r.ok ? 'Valid US number' : r.msg);
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', ()=>{
    wireEmail();
    wirePhone();
  });
})();

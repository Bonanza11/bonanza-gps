/* =========================================================================
   /public/app/scripts/validators.js — Bonanza (email, US phone, required)
   -------------------------------------------------------------------------
   - Muestra hints (verde/rojo) solo cuando el usuario interactúa o hay texto.
   - Sin bordes rojos: la clase .invalid aquí NO cambia estilos (tu CSS lo evita).
   - Exporta BNZ.validators para otros módulos.
   ======================================================================== */

(function(){
  "use strict";

  // ────────────────────────────────────────────────────────────
  // Config / RegEx
  // ────────────────────────────────────────────────────────────
  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  // Acepta 10 dígitos (o 11 comenzando con 1). Se permiten separadores.
  const usPhoneRx = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/;

  // ────────────────────────────────────────────────────────────
  // Helpers DOM
  // ────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function showHint(el, kind, text){
    if(!el) return;
    el.className = "hint show " + (kind || "");
    el.textContent = text || "";
  }
  function hideHint(el){
    if(!el) return;
    el.className = "hint";
    el.textContent = "";
  }
  function setInvalid(el, bad){
    if(!el) return;
    // Visualmente no cambia bordes por tu CSS; sirve de “flag” para otros módulos.
    el.classList.toggle("invalid", !!bad);
  }

  // ────────────────────────────────────────────────────────────
  // Email live validation
  // ────────────────────────────────────────────────────────────
  (function wireEmail(){
    const input = $("email");
    const help  = $("emailHelp");
    if(!input) return;

    const state = { touched:false };

    const isValid = (v) => emailRx.test(String(v||"").trim());

    function evaluate(){
      const v = String(input.value||"");
      const touchedOrFilled = state.touched || v.trim().length>0;

      if(!touchedOrFilled){
        hideHint(help);
        setInvalid(input, false);
        return;
      }

      const ok = isValid(v);
      setInvalid(input, !ok);
      if(ok) showHint(help, "ok", "Valid email");
      else   showHint(help, "err", "Please enter a valid email (e.g., name@domain.com)");
    }

    input.addEventListener("blur",  ()=>{ state.touched = true; evaluate(); });
    input.addEventListener("input", evaluate);

    // Inicio limpio
    hideHint(help);
  })();

  // ────────────────────────────────────────────────────────────
  // US Phone live formatting + validation
  // ────────────────────────────────────────────────────────────
  (function wirePhone(){
    const input = $("phone");
    const help  = $("phoneHelp");
    if(!input) return;

    const state = { touched:false };

    const isValid = (v) => {
      const s = String(v||"").trim();
      // permite que se valide ya sea el texto formateado o sólo dígitos
      if (usPhoneRx.test(s)) return true;
      const d = s.replace(/\D/g,"");
      if (d.length===11 && d.startsWith("1")) return true;
      return d.length===10;
    };

    function prettyFormat(digits){
      let d = String(digits||"").replace(/\D/g,"");
      if (d.startsWith("1")) d = d.slice(1);   // quita prefijo 1 si llega
      d = d.slice(0,10);
      const a=d.slice(0,3), b=d.slice(3,6), c=d.slice(6,10);
      if (d.length>6) return `(${a}) ${b}-${c}`;
      if (d.length>3) return `(${a}) ${b}`;
      if (d.length>0) return `(${a}`;
      return "";
    }

    function evaluate(){
      const raw = String(input.value||"");
      // formateo en vivo
      const digits = raw.replace(/\D/g,"").slice(0,11);
      const formatted = prettyFormat(digits);
      if (formatted !== input.value) {
        const pos = input.selectionStart;
        input.value = formatted;
        // mueve el cursor al final (simple y sólido para móviles)
        input.setSelectionRange(input.value.length, input.value.length);
      }

      const touchedOrFilled = state.touched || input.value.trim().length>0;
      if(!touchedOrFilled){
        hideHint(help);
        setInvalid(input, false);
        return;
      }

      const ok = isValid(input.value);
      setInvalid(input, !ok);
      if(ok) showHint(help, "ok", "Valid US phone");
      else   showHint(help, "err", "Enter a valid US number");
    }

    input.addEventListener("blur",  ()=>{ state.touched = true; evaluate(); });
    input.addEventListener("input", evaluate);

    // Inicio limpio
    hideHint(help);
  })();

  // ────────────────────────────────────────────────────────────
  // Export para otros módulos
  // ────────────────────────────────────────────────────────────
  window.BNZ = window.BNZ || {};
  window.BNZ.validators = {
    email(v){ return emailRx.test(String(v||"").trim()); },
    usPhone(v){
      const s = String(v||"").trim();
      if (usPhoneRx.test(s)) return true;
      const d = s.replace(/\D/g,"");
      if (d.length===11 && d.startsWith("1")) return true;
      return d.length===10;
    },
    requireFilled(ids){
      let ok = true;
      (ids||[]).forEach(id=>{
        const el = $(id);
        const bad = !el || !String(el.value||"").trim();
        setInvalid(el, bad);
        if (bad) ok = false;
      });
      return ok;
    }
  };
})();

/* =========================================================================
   validators.js — Bonanza (email, teléfono US, hints tras interacción)
   ======================================================================== */

(function () {
  "use strict";

  const emailRx   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  const usPhoneRx = /^\+?1?[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}$/;

  const $ = (id) => document.getElementById(id);

  // Utilidad: aplica/quita .invalid (sin bordes rojos por CSS)
  function setInvalid(el, bad) {
    if (!el) return;
    el.classList.toggle("invalid", !!bad);
  }

  // ───────────────── Email (live) ─────────────────
  (function wireEmail() {
    const input = $("email");
    const help  = $("emailHelp");
    if (!input || !help) return;

    const state = { touched: false };

    function hide() {
      help.className = "hint"; help.textContent = "";
      setInvalid(input, false);
    }
    function showOk() {
      help.className = "hint show ok"; help.textContent = "Valid email";
      setInvalid(input, false);
    }
    function showErr() {
      help.className = "hint show err"; help.textContent = "Please enter a valid email (e.g., name@domain.com)";
      setInvalid(input, true);
    }

    function evaluate() {
      const v = String(input.value || "").trim();
      const hasText = v.length > 0;
      if (!state.touched && !hasText) { hide(); return; }
      const ok = emailRx.test(v);
      if (!hasText) { hide(); return; }      // vacío: no mostrar nada
      if (ok) showOk(); else showErr();
    }

    input.addEventListener("blur", () => { state.touched = true; evaluate(); });
    input.addEventListener("input", evaluate);

    hide(); // inicio limpio
  })();

  // ───────────────── Teléfono US (formatea + live) ─────────────────
  (function wirePhone() {
    const input = $("phone");
    const help  = $("phoneHelp");
    if (!input || !help) return;

    const state = { touched: false };

    function hide() {
      help.className = "hint"; help.textContent = "";
      setInvalid(input, false);
    }
    function showOk() {
      help.className = "hint show ok"; help.textContent = "Valid US phone";
      setInvalid(input, false);
    }
    function showErr() {
      help.className = "hint show err"; help.textContent = "Enter a valid US number";
      setInvalid(input, true);
    }

    function prettyFormat(digits) {
      let d = String(digits).replace(/\D/g, "");
      if (d.startsWith("1")) d = d.slice(1); // quita +1 si viene
      d = d.slice(0, 10);
      const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 10);
      if (d.length > 6) return `(${a}) ${b}-${c}`;
      if (d.length > 3) return `(${a}) ${b}`;
      if (d.length > 0) return `(${a}`;
      return "";
    }

    function evaluate() {
      const raw = String(input.value || "");
      const digits = raw.replace(/\D/g, "").slice(0, 11);
      // formateo “bonito” sin forzar cursor cuando está borrando
      const formatted = prettyFormat(digits);
      if (formatted !== input.value) input.value = formatted;

      const v = String(input.value || "");
      const hasText = v.trim().length > 0;
      if (!state.touched && !hasText) { hide(); return; }
      if (!hasText) { hide(); return; }      // vacío: no mostrar nada

      const ok = usPhoneRx.test(v);
      if (ok) showOk(); else showErr();
    }

    input.addEventListener("blur", () => { state.touched = true; evaluate(); });
    input.addEventListener("input", evaluate);

    hide(); // inicio limpio
  })();

  // ───────────────── Utilidades públicas ─────────────────
  window.BNZ = window.BNZ || {};
  window.BNZ.validators = {
    email: (v) => emailRx.test(String(v || "").trim()),
    usPhone: (v) => usPhoneRx.test(String(v || "").trim()),
    requireFilled(ids) {
      let ok = true;
      (ids || []).forEach((id) => {
        const el = $(id);
        const bad = !el || !String(el.value || "").trim();
        setInvalid(el, bad);
        if (bad) ok = false;
      });
      return ok;
    },
  };
})();

/* =========================================================================
   /public/app/scripts/validators.js — Bonanza Transportation
   -------------------------------------------------------------------------
   Valida y normaliza campos del formulario (nombre, email, phone, fecha/hora,
   pickup/dropoff) y expone helpers bajo `BNZ.validators`.

   API expuesta (window.BNZ.validators):
     - setInvalid(el, bad)
     - validateEmail(v)        -> { ok, msg }
     - validateUSPhone(v)      -> { ok, msg, formatted }
     - validateRequired(v)     -> { ok, msg }
     - validateDateTime24h(d,t)-> { ok, msg, isAfterHours }
     - isAfterHours(d,t)       -> boolean
     - earliestAllowedDt()     -> Date (+24h redondeado al cuarto)
     - wireLiveValidation()    -> conecta listeners a los inputs
     - validateAllBasic()      -> true/false (marca .invalid donde aplique)

   Reglas:
     - Fecha/hora mínimo 24h de antelación.
     - Horario operativo 06:00–23:00; fuera de esto es After-Hours.
     - Formato teléfono US (NANP) y email básico con antitypos.
   ========================================================================== */

(function () {
  "use strict";

  // Namespace global
  window.BNZ = window.BNZ || {};
  const V = (window.BNZ.validators = {});

  // ----- Config horarios -----
  const OPERATING_START = "06:00";
  const OPERATING_END   = "23:00";

  // ===== Helpers base =====
  function $(id) { return document.getElementById(id); }

  function setInvalid(el, bad) {
    if (!el) return;
    el.classList.toggle("invalid", !!bad);
    el.classList.toggle("valid", !bad && String(el.value || "").trim().length > 0);
  }

  function validateRequired(v, label = "This field") {
    const ok = !!String(v || "").trim();
    return ok ? { ok: true, msg: "" } : { ok: false, msg: `${label} is required.` };
  }

  // ===== Email =====
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/;
  const COMMON_TYPOS = [
    /@gmal\.com$/i, /@gmial\.com$/i, /@hotnail\.com$/i, /@yaho\.com$/i,
    /@outlok\.com$/i, /@icloud\.co$/i
  ];
  function validateEmail(v) {
    const val = String(v || "").trim();
    if (!val) return { ok: false, msg: "Email is required." };
    if (!EMAIL_RX.test(val)) return { ok: false, msg: "Enter a valid email (e.g., name@domain.com)." };
    if (/\.\./.test(val))   return { ok: false, msg: "Email cannot contain consecutive dots." };
    if (COMMON_TYPOS.some(rx => rx.test(val))) {
      return { ok: false, msg: "Please correct the domain spelling (e.g., @gmail.com)." };
    }
    return { ok: true, msg: "Email looks good." };
  }

  // ===== Teléfono US (NANP) =====
  function digitsOnly(s) { return String(s || "").replace(/\D/g, ""); }
  function formatUS(d) {
    let ds = digitsOnly(d);
    if (ds.startsWith("1")) ds = ds.slice(1);
    ds = ds.slice(0, 10);
    const a = ds.slice(0, 3), b = ds.slice(3, 6), c = ds.slice(6);
    if (ds.length > 6) return `(${a}) ${b}-${c}`;
    if (ds.length > 3) return `(${a}) ${b}`;
    if (ds.length > 0) return `(${a}`;
    return "";
  }
  function validateUSPhone(v) {
    let ds = digitsOnly(v);
    if (ds.length === 11 && ds.startsWith("1")) ds = ds.slice(1);
    if (ds.length !== 10) return { ok: false, msg: "Enter a 10-digit US number", formatted: formatUS(v) };
    if (!/^[2-9]/.test(ds[0])) return { ok: false, msg: "Area code must start 2–9", formatted: formatUS(ds) };
    if (!/^[2-9]/.test(ds[3])) return { ok: false, msg: "Exchange must start 2–9", formatted: formatUS(ds) };
    return { ok: true, msg: "Valid US number", formatted: formatUS(ds) };
  }

  // ===== Tiempo (24h + after-hours) =====
  function nextQuarter(d) {
    const m = d.getMinutes();
    const add = 15 - (m % 15 || 15);
    d.setMinutes(m + add, 0, 0);
    return d;
  }
  function earliestAllowedDt() {
    return nextQuarter(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }
  function isAfterHours(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    const d = new Date(`${dateStr}T${timeStr}:00`);
    const [sh, sm] = OPERATING_START.split(":").map(Number);
    const [eh, em] = OPERATING_END.split(":").map(Number);
    const start = new Date(d); start.setHours(sh, sm, 0, 0);
    const end   = new Date(d); end.setHours(eh, em, 0, 0);
    return d < start || d > end;
  }
  function validateDateTime24h(dateStr, timeStr) {
    if (!dateStr || !timeStr) {
      return { ok: false, msg: "Choose Date & Time (min 24h)", isAfterHours: false };
    }
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    const ok24 = dt.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
    if (!ok24) return { ok: false, msg: "Pick at least 24 hours in advance.", isAfterHours: false };
    return { ok: true, msg: "", isAfterHours: isAfterHours(dateStr, timeStr) };
  }

  // ===== Live wiring (marca/quita .invalid en el momento) =====
  function wireLiveValidation() {
    const email = $("email");
    const phone = $("phone");
    const name  = $("fullname");
    const pick  = $("pickup");
    const drop  = $("dropoff");
    const date  = $("date");
    const time  = $("time");

    // Nombre / requireds
    [name, pick, drop].forEach(el => {
      if (!el) return;
      el.addEventListener("input", () => setInvalid(el, !validateRequired(el.value).ok));
      el.addEventListener("blur",  () => setInvalid(el, !validateRequired(el.value).ok));
    });

    // Email
    if (email) {
      const help = $("emailHelp");
      const update = () => {
        const r = validateEmail(email.value);
        setInvalid(email, !r.ok);
        if (help) { help.textContent = r.ok ? "Valid email" : r.msg; help.className = "hint " + (r.ok ? "ok" : "err"); }
      };
      email.addEventListener("input", update);
      email.addEventListener("blur", update);
      update();
    }

    // Phone
    if (phone) {
      const help = $("phoneHelp");
      const update = () => {
        const r = validateUSPhone(phone.value);
        phone.value = r.formatted || phone.value;
        setInvalid(phone, !r.ok);
        if (help) { help.textContent = r.ok ? "Valid US number" : r.msg; help.className = "hint " + (r.ok ? "ok" : "err"); }
      };
      phone.addEventListener("input", update);
      phone.addEventListener("blur", update);
      update();
    }

    // Fecha/Hora (24h + hint)
    const dateHelp = $("dateHelp");
    const timeHelp = $("timeHelp");
    const refreshHints = () => {
      if (date && date.value && dateHelp) {
        const d = new Date(date.value + "T00:00:00");
        dateHelp.textContent = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      }
      if (time && time.value && timeHelp) timeHelp.textContent = time.value;
      const r = validateDateTime24h(date?.value, time?.value);
      setInvalid(date, !r.ok);
      setInvalid(time, !r.ok);
    };
    if (date) date.addEventListener("change", refreshHints);
    if (time) time.addEventListener("change", refreshHints);

    // Inicializa valores mínimos por defecto (coincide con booking)
    const minDt = earliestAllowedDt();
    if (date && !date.min) {
      const off = minDt.getTimezoneOffset() * 60000;
      date.min = new Date(minDt - off).toISOString().slice(0, 10);
    }
    if (date && !date.value) {
      const off = minDt.getTimezoneOffset() * 60000;
      date.value = new Date(minDt - off).toISOString().slice(0, 10);
    }
    if (time && !time.value) {
      const hh = String(minDt.getHours()).padStart(2, "0");
      const mm = String(minDt.getMinutes()).padStart(2, "0");
      time.value = `${hh}:${mm}`;
    }
    refreshHints();
  }

  // ===== Validación “de golpe” (para Calculate o Pay) =====
  function validateAllBasic() {
    const name  = $("fullname");
    const phone = $("phone");
    const email = $("email");
    const pick  = $("pickup");
    const drop  = $("dropoff");
    const date  = $("date");
    const time  = $("time");

    const vName  = validateRequired(name?.value, "Full Name");
    const vPick  = validateRequired(pick?.value, "Pick-up Address");
    const vDrop  = validateRequired(drop?.value, "Drop-off Address");
    const vEmail = validateEmail(email?.value || "");
    const vPhone = validateUSPhone(phone?.value || "");
    const vDT    = validateDateTime24h(date?.value, time?.value);

    setInvalid(name,  !vName.ok);
    setInvalid(pick,  !vPick.ok);
    setInvalid(drop,  !vDrop.ok);
    setInvalid(email, !vEmail.ok);
    setInvalid(phone, !vPhone.ok);
    setInvalid(date,  !vDT.ok);
    setInvalid(time,  !vDT.ok);

    return vName.ok && vPick.ok && vDrop.ok && vEmail.ok && vPhone.ok && vDT.ok;
  }

  // Exponer API
  V.setInvalid = setInvalid;
  V.validateEmail = validateEmail;
  V.validateUSPhone = validateUSPhone;
  V.validateRequired = validateRequired;
  V.validateDateTime24h = validateDateTime24h;
  V.isAfterHours = isAfterHours;
  V.earliestAllowedDt = earliestAllowedDt;
  V.wireLiveValidation = wireLiveValidation;
  V.validateAllBasic = validateAllBasic;

  // Auto-wire al cargar
  document.addEventListener("DOMContentLoaded", wireLiveValidation);
})();

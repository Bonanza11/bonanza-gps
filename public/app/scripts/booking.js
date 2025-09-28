/* booking.js — Bonanza GPS (UI + pricing + reglas de negocio)
   Depende de:
     - maps.js  → escucha 'bnz:calculate' y llama BNZ.renderQuote(leg,{surcharge})
     - stripe.js → usa window.__lastQuotedTotal, __vehicleType, __lastDistanceMiles
*/
(function(){
  "use strict";

  // ────────────────────────────────────────────────────────────
  // Config / Reglas
  // ────────────────────────────────────────────────────────────
  const OPERATING_START = "06:00";  // 6:00 AM
  const OPERATING_END   = "23:00";  // 11:00 PM
  const AFTER_HOURS_PCT = 0.25;     // 25%
  const MG_FEE_USD      = 50;       // Meet & Greet (SLC only, SUV)
  const VAN_MULTIPLIER  = 1.30;     // VAN ×1.30

  const SUV_IMG = "/images/suburban.png";
  const VAN_IMG = "/images/van-sprinter.png";

  // ────────────────────────────────────────────────────────────
  // Listas de coincidencias (texto fallback)
  // ────────────────────────────────────────────────────────────
  const SLC_MATCHES = (window.BNZ_AIRPORTS?.slcNames) || [
    "salt lake city international airport","slc airport","slc intl","slc int’l","salt lake city airport",
    "w terminal dr, salt lake city","slc terminal","salt lake city international"
  ];
  const JSX_MATCHES = (window.BNZ_AIRPORTS?.jsxNames) || [
    "jsx","jsx slc","jsx terminal","jsx salt lake","signature flight support jsx","jsx air"
  ];
  const PVU_MATCHES = (window.BNZ_AIRPORTS?.pvuNames) || [
    "provo airport","provo municipal airport","pvu","pvu airport"
  ];
  const FBO_MATCHES = [
    "fbo","jet center","private terminal","general aviation","hangar",
    "atlantic aviation","million air","signature","ross aviation","tac air",
    "ok3 air","lynx","modern aviation","provo jet center"
  ];
  const MUNICIPAL_KEYWORDS = ["municipal airport","city airport"];

  // Heber Valley Airport (Russ McDonald Field) — tratar como FBO
  const HEBER_MATCHES = [
    "heber valley airport",
    "heber city municipal",
    "russ mcdonald field",
    "khcr","hcr",
    "south airport road, heber city"
  ];

  // Normaliza texto
  function norm(x){ return String(x || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  // Texto “mejor” del pickup
  function getPickupText(){
    const inputVal = document.getElementById("pickup")?.value || "";
    const place = window.pickupPlace || null;
    const fromPlace = place ? (place.name || place.formatted_address || place.vicinity || "") : "";
    const cand = fromPlace.length >= inputVal.length ? fromPlace : inputVal;
    return norm(cand);
  }

  const hasAny = (txt, arr) => arr.some(k => txt.includes(norm(k)));
  const looksLikeHeber = () => hasAny(getPickupText(), HEBER_MATCHES);

  // Categoría del pickup → slc | jsx | pvu | fbo | municipal | other
  function pickupCategory(){
    const txt = getPickupText();
    if (!txt) return "other";
    if (hasAny(txt, JSX_MATCHES)) return "jsx";
    if (hasAny(txt, SLC_MATCHES)) return "slc";
    if (hasAny(txt, PVU_MATCHES)) return "pvu";
    if (looksLikeHeber()) return "fbo";                // Heber como FBO
    if (hasAny(txt, FBO_MATCHES)) return "fbo";
    if (hasAny(txt, MUNICIPAL_KEYWORDS)) return "municipal";
    return "other";
  }

  // Texto parece SLC comercial (no JSX ni FBO)
  function looksLikeSLCCommercialByText(){
    const txt = getPickupText();
    if (!txt) return false;
    const isSLC = hasAny(txt, SLC_MATCHES);
    const isJSX = hasAny(txt, JSX_MATCHES);
    const isFBO = hasAny(txt, FBO_MATCHES) || looksLikeHeber();
    return isSLC && !isJSX && !isFBO;
  }

  // ¿Pickup es SLC o JSX (para excepción de surcharge)?
  function isPickupSLCorJSX(){
    const txt = getPickupText();
    if (!txt) return false;
    return hasAny(txt, SLC_MATCHES) || hasAny(txt, JSX_MATCHES);
  }

  // ────────────────────────────────────────────────────────────
  // Estado compartido
  // ────────────────────────────────────────────────────────────
  const BNZ = window.BNZ = window.BNZ || {};
  BNZ.state = BNZ.state || {
    vehicle: "suv",            // 'suv' | 'van'
    mgChoice: "none",          // 'none'|'tsa_exit'|'baggage_claim'
    last: null                 // último cálculo
  };

  // Guarda totals para stripe.js
  function publishTotals(t){
    window.__lastQuotedTotal   = t.total;
    window.__lastDistanceMiles = t.miles;
    window.__vehicleType       = BNZ.state.vehicle;
  }

  // Tabla base
  function baseFare(miles){
    if (miles <= 10) return 120;
    if (miles <= 35) return 190;
    if (miles <= 39) return 210;
    if (miles <= 48) return 230;
    if (miles <= 55) return 250;
    return miles * 5.4;
  }

  // Vehículo
  function applyVehicle(total){
    return BNZ.state.vehicle === "van" ? Math.round(total * VAN_MULTIPLIER) : Math.round(total);
  }

  // 24h helpers
  function nextQuarter(d){ const m=d.getMinutes(); const add=15-(m%15||15); d.setMinutes(m+add,0,0); return d; }
  function earliestAllowed(){ return nextQuarter(new Date(Date.now()+24*60*60*1000)); }
  function localISO(d){ const off=d.getTimezoneOffset()*60000; return new Date(d-off).toISOString().slice(0,10); }
  function ensureMin24h(){
    const dEl = document.getElementById("date");
    const tEl = document.getElementById("time");
    const min = earliestAllowed();
    if (dEl){ dEl.min = localISO(min); if(!dEl.value) dEl.value = localISO(min); }
    if (tEl && !tEl.value){
      tEl.value = String(min.getHours()).padStart(2,"0")+":"+String(min.getMinutes()).padStart(2,"0");
    }
  }
  function selectedDateTime(){
    const ds = document.getElementById("date")?.value;
    const ts = document.getElementById("time")?.value;
    if(!ds || !ts) return null;
    return new Date(`${ds}T${ts}:00`);
  }
  function atLeast24h(dt){ return dt && (dt.getTime() - Date.now() >= 24*60*60*1000); }

  // After-hours
  function isAfterHours(dateStr, timeStr){
    if(!dateStr || !timeStr) return false;
    const d = new Date(`${dateStr}T${timeStr}:00`);
    const [sh,sm] = OPERATING_START.split(":").map(Number);
    const [eh,em] = OPERATING_END.split(":").map(Number);
    const start = new Date(d); start.setHours(sh, sm, 0, 0);
    const end   = new Date(d); end.setHours(eh, em, 0, 0);
    return (d < start) || (d > end);
  }

  // Meet & Greet (visible sólo si SLC comercial y SUV)
  function mgShouldShow(){
    if (BNZ.state.vehicle !== "suv") return false;
    const hasPlace = !!window.pickupPlace;
    const okByPlace = hasPlace &&
      typeof window.isSLCInternational === "function" &&
      window.isSLCInternational(window.pickupPlace);
    const okByText = looksLikeSLCCommercialByText();
    return okByPlace || okByText;
  }

  function mgFee(){ return BNZ.state.mgChoice !== "none" ? MG_FEE_USD : 0; }

  function mgSyncCard(){
    const card = document.getElementById("meetGreetCard");
    if(!card) return;
    if (mgShouldShow()){
      card.style.display = "block";
    } else {
      card.style.display = "none";
      BNZ.state.mgChoice = "none";
    }
    card.querySelectorAll(".mg-btn")?.forEach(b=>{
      const on = (b.dataset.choice || "none") === BNZ.state.mgChoice;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("tabindex", "0");
    });
  }

  // ────────────────────────────────────────────────────────────
  // Flight UI — según categoría de pickup (sin validación)
  // ────────────────────────────────────────────────────────────
  function flightSyncUI(){
    const box = document.getElementById("flightBox");
    const comm = document.getElementById("flightCommercial");
    const priv = document.getElementById("flightPrivate");
    const badge = document.getElementById("flightBadge");
    const title = document.getElementById("flightTitle");
    const explain = document.getElementById("flightExplain");
    const hint = document.getElementById("flightHint");
    if(!box || !comm || !priv) return;

    const cat = pickupCategory();

    box.style.display = "none";
    comm.style.display = "none";
    priv.style.display = "none";

    if (cat === "slc" || cat === "pvu") {
      box.style.display = "block"; comm.style.display = "grid";
      badge.textContent = "Commercial";
      title.textContent = "Flight Details";
      explain.textContent = "Add your flight number and origin city to help your driver.";
      hint.textContent = "Example: DL1234 — Los Angeles (LAX).";
    } else if (cat === "jsx") {
      box.style.display = "block"; comm.style.display = "grid";
      badge.textContent = "JSX";
      title.textContent = "JSX Flight";
      explain.textContent = "Add your flight number and origin city.";
      hint.textContent = "Example: XE123 — Burbank (BUR).";
    } else if (cat === "fbo" || cat === "municipal") {
      box.style.display = "block"; priv.style.display = "grid";
      badge.textContent = "Private / FBO";
      title.textContent = "Private Flight Details";
      // ← sin “Optional:” como pediste
      explain.textContent = "Add your aircraft tail number and city (origin or destination).";
      hint.textContent = "Examples: Tail N123AB — City Burbank (BUR) or Denver (DEN).";
    }
  }

  // Expuesto para maps.js (cuando cambia pickup)
  BNZ.onPickupPlaceChanged = function(){
    mgSyncCard();
    flightSyncUI();
  };

  // También expuesto por conveniencia
  window.updateMeetGreetVisibility = mgSyncCard;

  // Recalcular totales si ya hay leg
  window.recalcFromCache = function(){
    if (BNZ.state.last){
      BNZ.renderQuote(BNZ.state.last.leg, { surcharge: BNZ.state.last.surcharge });
    }
  };

  // ────────────────────────────────────────────────────────────
  // Render del presupuesto (Trip Summary + PAY NOW adentro)
  // ────────────────────────────────────────────────────────────
  BNZ.renderQuote = function(leg, {surcharge=0}={}){
    const miles = (leg?.distance?.value || 0) / 1609.34;

    // Excepción: SLC/JSX sin distance surcharge
    let adjustedSurcharge = surcharge;
    if (isPickupSLCorJSX()) adjustedSurcharge = 0;

    const base  = baseFare(miles);
    const dateV = document.getElementById("date")?.value || "";
    const timeV = document.getElementById("time")?.value || "";
    const ah    = isAfterHours(dateV, timeV) ? (base + adjustedSurcharge) * AFTER_HOURS_PCT : 0;
    const mg    = mgFee();

    const subtotal = base + adjustedSurcharge + ah + mg;
    const total    = applyVehicle(subtotal);

    BNZ.state.last = { miles, base, surcharge: adjustedSurcharge, ah, mg, total, leg };
    publishTotals(BNZ.state.last);
    paintSummary(BNZ.state.last, leg);
    enablePayIfReady();
  };

  function paintSummary(t, leg){
    const el = document.getElementById("info");
    if(!el) return;

    const distTxt = t.miles.toFixed(1) + " mi";
    const durTxt  = leg?.duration?.text || "";
    const rows = [
      t.surcharge>0 ? row("Distance Surcharge", t.surcharge) : "",
      t.ah>0        ? row("After-Hours (25%)",  t.ah)        : "",
      t.mg>0        ? row("Meet & Greet (SLC)",t.mg)        : ""
    ].filter(Boolean).join("");

    const cn = window.__lastCN || window.__reservationCode || "";

    el.style.display = "block";
    el.innerHTML = `
      <div class="info-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Trip Summary</span>
        ${cn ? `<span style="font-weight:700;color:#ffddae;font-size:.95rem">Confirmation: <span style="letter-spacing:.3px">${cn}</span></span>` : ""}
      </div>

      <div class="kpis">
        <div class="kpi"><div class="label">Distance</div><div class="value">${distTxt}</div></div>
        <div class="kpi"><div class="label">Duration</div><div class="value">${durTxt}</div></div>
        <div class="kpi"><div class="label">Price</div><div class="value price">$${t.total.toFixed(2)}</div></div>
      </div>

      ${rows ? `<div class="divider"></div><div class="breakdown">${rows}</div>` : ""}

      <div class="row total" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;margin-top:6px">
        <span>Total</span><span>$${t.total.toFixed(2)}</span>
      </div>
      <div class="tax-note">Taxes & gratuity included</div>

      <!-- Botón Pay dentro del resumen -->
      <div class="pay-row" style="display:flex;justify-content:flex-end;margin-top:12px">
        <button id="payProxy">PAY NOW</button>
      </div>
    `;

    // Sincroniza el "proxy" con el botón real #pay que usa stripe.js
    const proxy = document.getElementById("payProxy");
    const real  = document.getElementById("pay");   // el original, oculto fuera del resumen
    if (proxy && real){
      proxy.addEventListener("click", ()=> real.click());
      proxy.disabled = real.disabled || !window.__lastQuotedTotal;
      proxy.style.opacity = proxy.disabled ? .5 : 1;
      proxy.style.cursor  = proxy.disabled ? "not-allowed" : "pointer";
    }

    function row(label, val){
      return `<div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span>${label}</span><span>$${val.toFixed(2)}</span>
              </div>`;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Términos & Botones
  // ────────────────────────────────────────────────────────────
  const acceptPill   = document.getElementById("acceptPill");
  const termsBox     = document.getElementById("termsBox");
  const termsSummary = document.querySelector("#termsBox .terms-summary");
  const acceptLabel  = document.querySelector("#termsBox .accept-label");
  const calcBtn      = document.getElementById("calculate");
  const payBtn       = document.getElementById("pay");

  function isAccepted(){
    return acceptPill?.classList.contains("on") ||
           acceptPill?.getAttribute("aria-checked") === "true";
  }
  function setAccepted(on){
    if(!acceptPill) return;
    acceptPill.classList.toggle("on", on);
    acceptPill.setAttribute("aria-checked", on ? "true" : "false");
    termsSummary?.setAttribute("aria-pressed", on ? "true" : "false");
    syncButtons();
  }
  function syncButtons(){
    if (calcBtn) calcBtn.disabled = !isAccepted();
    enablePayIfReady();
  }
  function enablePayIfReady(){
    const ready = !!window.__lastQuotedTotal && isAccepted();
    if (payBtn){
      payBtn.style.display = "block";
      payBtn.disabled = !ready;
      payBtn.style.opacity = ready ? 1 : .5;
      payBtn.style.cursor  = ready ? "pointer" : "not-allowed";
    }
    const proxy = document.getElementById("payProxy");
    if (proxy){
      proxy.disabled = !ready;
      proxy.style.opacity = ready ? 1 : .5;
      proxy.style.cursor  = ready ? "pointer" : "not-allowed";
    }
  }

  const shouldToggle = (e) => !e.target.closest("a");
  const toggleAccept = (e) => { if (shouldToggle(e)) { e.stopPropagation(); setAccepted(!isAccepted()); } };

  // Manejo robusto de toque en iPhone
  ["touchstart","click","pointerup","touchend"].forEach(evt=>{
    acceptPill?.addEventListener(evt, toggleAccept, {passive:true});
    termsSummary?.addEventListener(evt, toggleAccept, {passive:true});
    termsBox?.addEventListener(evt, toggleAccept, {passive:true});
    acceptLabel?.addEventListener(evt, toggleAccept, {passive:true});
  });

  const kbd = (e)=>{
    if (e.key===" " || e.key==="Enter"){
      if (e.target.closest("a")) return;
      e.preventDefault();
      setAccepted(!isAccepted());
    }
  };
  acceptPill?.addEventListener("keydown", kbd);
  termsSummary?.addEventListener("keydown", kbd);

  // Vehículo
  (function wireVehicle(){
    const btns = document.querySelectorAll(".veh-btn");
    const img  = document.querySelector(".turntable .car");
    const cap  = document.querySelector(".turntable .vehicle-caption");

    const initiallyActive = Array.from(btns).find(b => b.classList.contains("active"));
    if (initiallyActive) BNZ.state.vehicle = initiallyActive.dataset.type || "suv";

    btns.forEach(b=>{
      b.addEventListener("click", ()=>{
        btns.forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        BNZ.state.vehicle = b.dataset.type || "suv";
        if (BNZ.state.vehicle === "suv"){
          if (img) img.src = SUV_IMG;
          if (cap) cap.textContent = "SUV — Max 5 passengers, 5 suitcases";
        } else {
          if (img) img.src = VAN_IMG;
          if (cap) cap.textContent = "Van — Up to 12 passengers, luggage varies";
        }
        mgSyncCard();
        flightSyncUI();
        if (BNZ.state.last){
          BNZ.renderQuote(BNZ.state.last.leg, { surcharge: BNZ.state.last.surcharge });
        }
      });
    });
  })();

  // Meet & Greet
  (function wireMG(){
    const card = document.getElementById("meetGreetCard");
    if(!card) return;
    const btns = card.querySelectorAll(".mg-btn");
    btns.forEach(b=>{
      const on = (b.dataset.choice || "none") === BNZ.state.mgChoice;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("tabindex", "0");
      b.addEventListener("click", ()=>{
        BNZ.state.mgChoice = b.dataset.choice || "none";
        btns.forEach(x=>{
          const on2 = x.dataset.choice === BNZ.state.mgChoice;
          x.classList.toggle("active", on2);
          x.setAttribute("aria-pressed", String(on2));
        });
        if (BNZ.state.last){
          BNZ.renderQuote(BNZ.state.last.leg, { surcharge: BNZ.state.last.surcharge });
        }
      });
    });
    mgSyncCard();
  })();

  // ────────────────────────────────────────────────────────────
  // Calculate (sin validación de vuelos)
  // ────────────────────────────────────────────────────────────
  const handleCalculate = async ()=>{
    if (!isAccepted()){ alert("Please accept Terms & Conditions first."); return; }

    const need = ["fullname","phone","email","pickup","dropoff","date","time"];
    const missing = need.filter(id => {
      const el = document.getElementById(id);
      const empty = !el || !el.value || !String(el.value).trim();
      if (el) el.classList.toggle("invalid", empty);
      return empty;
    });
    if (missing.length){ alert("Please complete all required fields."); return; }

    const dt = selectedDateTime();
    if (!atLeast24h(dt)){ alert("Please choose Date & Time at least 24 hours in advance."); return; }

    const cat = pickupCategory();

    // Campos de vuelo
    const flightNumberEl = document.getElementById("flightNumber");
    const originCityEl   = document.getElementById("flightOrigin");      // comercial/jsx
    const tailNumberEl   = document.getElementById("tailNumber");
    const privCityEl     = document.getElementById("flightCityPrivate"); // privados

    let flightNumber = flightNumberEl?.value?.trim();
    let originCity   = originCityEl?.value?.trim();
    let tailNumber   = tailNumberEl?.value?.trim();
    let privCity     = privCityEl?.value?.trim();

    if (flightNumber) flightNumber = flightNumber.replace(/\s+/g,"").toUpperCase();
    if (tailNumber)   tailNumber   = tailNumber.replace(/\s+/g,"").toUpperCase();

    // UX: cierra teclado/focus móvil antes de calcular
    if (document.activeElement?.blur) document.activeElement.blur();

    // Dispara cálculo con metadatos de vuelo (comercial o privados)
    document.dispatchEvent(new CustomEvent("bnz:calculate", {
      detail: {
        flight: {
          cat,
          flightNumber,
          originCity: originCity || privCity || "",
          privateCity: privCity || "",
          tailNumber,
          verified: false,
          verification: null
        }
      }
    }));
  };
  document.getElementById("calculate")?.addEventListener("click", handleCalculate);

  // On load
  document.addEventListener("DOMContentLoaded", ()=>{
    ensureMin24h();
    setAccepted(acceptPill?.getAttribute("aria-checked")==="true" || acceptPill?.classList.contains("on"));
    mgSyncCard();
    flightSyncUI();
  });
})();

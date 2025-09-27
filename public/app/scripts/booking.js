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
  // Listas de coincidencias por NOMBRE/DIRECCIÓN (fallback texto)
  // ────────────────────────────────────────────────────────────
  const SLC_MATCHES = (window.BNZ_AIRPORTS?.slcNames) || [
    "salt lake city international airport",
    "slc airport",
    "slc intl",
    "slc int’l",
    "salt lake city airport",
    "w terminal dr, salt lake city",
    "slc terminal"
  ];
  const JSX_MATCHES = (window.BNZ_AIRPORTS?.jsxNames) || [
    "jsx",
    "jsx slc",
    "jsx terminal",
    "jsx salt lake",
    "signature flight support jsx"
  ];
  const FBO_MATCHES = [
    "fbo","jet center","private terminal","general aviation","hangar",
    "atlantic aviation","million air","signature","ross aviation","tac air",
    "ok3 air","lynx","modern aviation","provo jet center"
  ];

  // Normaliza texto para comparar
  function norm(x){
    return String(x || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  // Obtén texto “mejor disponible” del pickup
  function getPickupText(){
    const inputVal = document.getElementById("pickup")?.value || "";
    const place = window.pickupPlace || null;
    const fromPlace = place
      ? (place.name || place.formatted_address || place.vicinity || "")
      : "";
    const cand = fromPlace.length >= inputVal.length ? fromPlace : inputVal;
    return norm(cand);
  }

  // Texto parece SLC comercial (no JSX ni FBO)
  function looksLikeSLCCommercialByText(){
    const txt = getPickupText();
    if (!txt) return false;
    const isSLC = SLC_MATCHES.some(k => txt.includes(norm(k)));
    const isJSX = JSX_MATCHES.some(k => txt.includes(norm(k)));
    const isFBO = FBO_MATCHES.some(k => txt.includes(norm(k)));
    return isSLC && !isJSX && !isFBO;
  }

  // ¿Pickup es SLC o JSX (para la excepción del surcharge)?
  function isPickupSLCorJSX(){
    const txt = getPickupText();
    if (!txt) return false;
    const hitSLC = SLC_MATCHES.some(k => txt.includes(norm(k)));
    const hitJSX = JSX_MATCHES.some(k => txt.includes(norm(k)));
    return hitSLC || hitJSX;
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
    return BNZ.state.vehicle === "van"
      ? Math.round(total * VAN_MULTIPLIER)
      : Math.round(total);
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
  function atLeast24h(dt){
    return dt && (dt.getTime() - Date.now() >= 24*60*60*1000);
  }

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

    // 1) Si maps.js nos dio un place con tipos/dirección → usa isSLCInternational
    const hasPlace = !!window.pickupPlace;
    const okByPlace = hasPlace &&
      typeof window.isSLCInternational === "function" &&
      window.isSLCInternational(window.pickupPlace);

    // 2) Fallback por texto (si no hay place completo o el usuario escribió a mano)
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
      // feedback visual/aria
      card.querySelectorAll(".mg-btn")?.forEach(b=>{
        const on = b.dataset.choice === "none";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
  }

  // Expuesto para maps.js (cuando cambia pickup)
  BNZ.onPickupPlaceChanged = function(/*place*/){
    mgSyncCard();
  };

  // ────────────────────────────────────────────────────────────
  // Render del presupuesto (leg + surcharge viene de maps.js)
  // ────────────────────────────────────────────────────────────
  BNZ.renderQuote = function(leg, {surcharge=0}={}){
    const miles = (leg?.distance?.value || 0) / 1609.34;

    // ✅ EXCEPCIÓN: SLC Airport o JSX → NO aplicar Distance Surcharge
    let adjustedSurcharge = surcharge;
    if (isPickupSLCorJSX()){
      adjustedSurcharge = 0;
    }

    const base  = baseFare(miles);
    const dateV = document.getElementById("date")?.value || "";
    const timeV = document.getElementById("time")?.value || "";
    const ah    = isAfterHours(dateV, timeV) ? (base + adjustedSurcharge) * AFTER_HOURS_PCT : 0;
    const mg    = mgFee();

    const subtotal = base + adjustedSurcharge + ah + mg;
    const total    = applyVehicle(subtotal);

    BNZ.state.last = {
      miles,
      base,
      surcharge: adjustedSurcharge,
      ah,
      mg,
      total,
      leg
    };

    publishTotals(BNZ.state.last);
    paintSummary(BNZ.state.last, leg);
    enablePayIfReady();
  };

  // ────────────────────────────────────────────────────────────
  // UI — Resumen (con Confirmation # si está disponible)
  // ────────────────────────────────────────────────────────────
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
        <div class="kpi">
          <div class="label">Distance</div>
          <div class="value">${distTxt}</div>
        </div>
        <div class="kpi">
          <div class="label">Duration</div>
          <div class="value">${durTxt}</div>
        </div>
        <div class="kpi">
          <div class="label">Price</div>
          <div class="value price">$${t.total.toFixed(2)}</div>
        </div>
      </div>

      ${rows ? `<div class="divider"></div><div class="breakdown">${rows}</div>` : ""}

      <div class="row total" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;margin-top:6px">
        <span>Total</span><span>$${t.total.toFixed(2)}</span>
      </div>
      <div class="tax-note">Taxes & gratuity included</div>
    `;

    function row(label, val){
      return `<div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span>${label}</span><span>$${val.toFixed(2)}</span>
              </div>`;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Botones / Terms / Validaciones mínimas
  // ────────────────────────────────────────────────────────────
  const acceptPill = document.getElementById("acceptPill");
  const calcBtn    = document.getElementById("calculate");
  const payBtn     = document.getElementById("pay");

  function isAccepted(){ return acceptPill?.classList.contains("on"); }
  function setAccepted(on){
    if(!acceptPill) return;
    acceptPill.classList.toggle("on", on);
    acceptPill.setAttribute("aria-checked", on ? "true" : "false");
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
  }
  acceptPill?.addEventListener("click", ()=> setAccepted(!isAccepted()));
  acceptPill?.addEventListener("keydown", (e)=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); setAccepted(!isAccepted()); }});

  // Vehículo (cambia imagen/caption y re-evalúa MG)
  (function wireVehicle(){
    const btns = document.querySelectorAll(".veh-btn");
    const img  = document.querySelector(".turntable .car");
    const cap  = document.querySelector(".turntable .vehicle-caption");
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
        if (BNZ.state.last){
          BNZ.renderQuote(BNZ.state.last.leg, { surcharge: BNZ.state.last.surcharge });
        }
      });
    });
  })();

  // Meet & Greet botones
  (function wireMG(){
    const card = document.getElementById("meetGreetCard");
    if(!card) return;
    const btns = card.querySelectorAll(".mg-btn");
    btns.forEach(b=>{
      b.addEventListener("click", ()=>{
        BNZ.state.mgChoice = b.dataset.choice || "none";
        btns.forEach(x=>{
          const on = x.dataset.choice === BNZ.state.mgChoice;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", String(on));
        });
        if (BNZ.state.last){
          BNZ.renderQuote(BNZ.state.last.leg, { surcharge: BNZ.state.last.surcharge });
        }
      });
    });
    mgSyncCard();
  })();

  // Calculate → valida mínimos y dispara routing
  calcBtn?.addEventListener("click", ()=>{
    if (!isAccepted()){ alert("Please accept Terms & Conditions first."); return; }

    // Requeridos básicos
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

    document.dispatchEvent(new CustomEvent("bnz:calculate"));
  });

  // On load
  document.addEventListener("DOMContentLoaded", ()=>{
    ensureMin24h();
    syncButtons();
    mgSyncCard(); // asegura estado correcto al abrir
  });
})();

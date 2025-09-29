/* booking.js — Bonanza GPS (UI + pricing + reglas de negocio) */
(function(){
  "use strict";

  // Reglas
  const OPERATING_START = "07:00";
  const OPERATING_END   = "22:00";
  const AFTER_HOURS_PCT = 0.25;
  const MG_FEE_USD      = 50;
  const VAN_MULTIPLIER  = 1.30;

  const SUV_IMG = "/images/suburban.png";
  const VAN_IMG = "/images/van-sprinter.png";

  // Coincidencias (ampliadas para SLC)
  const SLC_MATCHES = (window.BNZ_AIRPORTS?.slcNames) || [
    "salt lake city international airport","slc airport","slc intl","slc int’l","salt lake city airport",
    "w terminal dr, salt lake city","slc terminal","salt lake city international",
    "slc","salt lake city (slc)","salt lake city slc"
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
  const HEBER_MATCHES = ["heber valley airport","heber city municipal","russ mcdonald field","khcr","hcr","south airport road, heber city"];

  function norm(x){ return String(x||"").toLowerCase().replace(/\s+/g," ").trim(); }
  function getPickupText(){
    const inputVal = document.getElementById("pickup")?.value || "";
    const place = window.pickupPlace || null;
    const fromPlace = place ? (place.name || place.formatted_address || place.vicinity || "") : "";
    const cand = fromPlace.length >= inputVal.length ? fromPlace : inputVal;
    return norm(cand);
  }
  const hasAny = (txt,arr)=>arr.some(k=>txt.includes(norm(k)));
  const looksLikeHeber = ()=>hasAny(getPickupText(), HEBER_MATCHES);

  function pickupCategory(){
    const txt = getPickupText();
    if(!txt) return "other";
    if(hasAny(txt, JSX_MATCHES)) return "jsx";
    if(hasAny(txt, SLC_MATCHES)) return "slc";
    if(hasAny(txt, PVU_MATCHES)) return "pvu";
    if(looksLikeHeber())         return "fbo";
    if(hasAny(txt, FBO_MATCHES)) return "fbo";
    if(hasAny(txt, MUNICIPAL_KEYWORDS)) return "municipal";
    return "other";
  }
  function isPickupSLCorJSX(){ const t=getPickupText(); return t && (hasAny(t,SLC_MATCHES) || hasAny(t,JSX_MATCHES)); }

  // Estado
  const BNZ = window.BNZ = window.BNZ || {};
  BNZ.state = BNZ.state || { vehicle:"suv", mgChoice:"none", last:null };

  // Precios
  function baseFare(m){ if(m<=10)return 120; if(m<=35)return 190; if(m<=39)return 210; if(m<=48)return 230; if(m<=55)return 250; return m*5.4; }
  function applyVehicle(x){ return BNZ.state.vehicle==="van" ? Math.round(x*VAN_MULTIPLIER) : Math.round(x); }

  // 24h
  function nextQuarter(d){ const m=d.getMinutes(); const add=15-(m%15||15); d.setMinutes(m+add,0,0); return d; }
  function earliestAllowed(){ return nextQuarter(new Date(Date.now()+24*60*60*1000)); }
  function localISO(d){ const off=d.getTimezoneOffset()*60000; return new Date(d-off).toISOString().slice(0,10); }
  function ensureMin24h(){
    const de=document.getElementById("date"), te=document.getElementById("time"), min=earliestAllowed();
    if(de){ de.min=localISO(min); if(!de.value) de.value=localISO(min); }
    if(te && !te.value){ te.value = `${String(min.getHours()).padStart(2,"0")}:${String(min.getMinutes()).padStart(2,"0")}`; }
  }
  function selectedDateTime(){ const ds=document.getElementById("date")?.value; const ts=document.getElementById("time")?.value; return (ds&&ts)?new Date(`${ds}T${ts}:00`):null; }
  function atLeast24h(dt){ return dt && (dt.getTime()-Date.now() >= 24*60*60*1000); }
  function isAfterHours(ds,ts){
    if(!ds||!ts) return false; const d=new Date(`${ds}T${ts}:00`);
    const [sh,sm]=OPERATING_START.split(":").map(Number); const [eh,em]=OPERATING_END.split(":").map(Number);
    const start=new Date(d); start.setHours(sh,sm,0,0); const end=new Date(d); end.setHours(eh,em,0,0);
    return (d<start)||(d>end);
  }

  // Meet & Greet (solo SLC comercial + SUV)
  function mgShouldShow(){ return BNZ.state.vehicle==="suv" && pickupCategory()==="slc"; }
  function mgFee(){ return BNZ.state.mgChoice!=="none" ? MG_FEE_USD : 0; }
  function mgSyncCard(){
    const card=document.getElementById("meetGreetCard"); if(!card) return;
    if(mgShouldShow()){ card.style.display="block"; } else { card.style.display="none"; BNZ.state.mgChoice="none"; }
    card.querySelectorAll(".mg-btn")?.forEach(b=>{ const on=(b.dataset.choice||"none")===BNZ.state.mgChoice;
      b.classList.toggle("active",on); b.setAttribute("aria-pressed",String(on)); b.setAttribute("tabindex","0");
    });
  }

  // Flight UI
  function flightSyncUI(){
    const box=document.getElementById("flightBox"), comm=document.getElementById("flightCommercial"),
          priv=document.getElementById("flightPrivate"), badge=document.getElementById("flightBadge"),
          title=document.getElementById("flightTitle"), explain=document.getElementById("flightExplain"),
          hint=document.getElementById("flightHint");
    if(!box||!comm||!priv) return;
    const cat=pickupCategory();
    box.style.display="none"; comm.style.display="none"; priv.style.display="none";
    if(cat==="slc"||cat==="pvu"){ box.style.display="block"; comm.style.display="grid";
      badge.textContent="Commercial"; title.textContent="Flight Details";
      explain.textContent="Add your flight number and origin city."; hint.textContent="Example: DL1234 — Los Angeles (LAX).";
    } else if(cat==="jsx"){ box.style.display="block"; comm.style.display="grid";
      badge.textContent="JSX"; title.textContent="JSX Flight";
      explain.textContent="Add your flight number and origin city."; hint.textContent="Example: XE123 — Burbank (BUR).";
    } else if(cat==="fbo"||cat==="municipal"){ box.style.display="block"; priv.style.display="grid";
      badge.textContent="Private / FBO"; title.textContent="Private Flight Details";
      explain.textContent="Add your aircraft tail number and city (origin or destination).";
      hint.textContent="Examples: Tail N123AB — City Burbank (BUR) or Denver (DEN).";
    }
  }

  BNZ.onPickupPlaceChanged=function(){ mgSyncCard(); flightSyncUI(); };
  window.updateMeetGreetVisibility=mgSyncCard;

  // Re-evaluar al tipear pickup (por si no usan Autocomplete)
  document.getElementById("pickup")?.addEventListener("input", function(){
    mgSyncCard(); flightSyncUI();
  });

  // Publicar totales para stripe
  function publishTotals(t){
    window.__lastQuotedTotal=t.total;
    window.__lastDistanceMiles=t.miles;
    window.__vehicleType=BNZ.state.vehicle;
  }

  // Inyectar PAY NOW dentro del summary
  function injectPayNow(){
    const box=document.getElementById("info"); if(!box) return;
    let btn=document.getElementById("pay");
    if(!btn){ btn=document.createElement("button"); btn.id="pay"; btn.textContent="PAY NOW"; btn.disabled=true; }
    btn.classList.add("pay-now"); btn.style.display="block";
    if(btn.parentElement!==box) box.appendChild(btn);
    if(typeof window.wireStripePayButton==="function"){ try{ window.wireStripePayButton(btn); }catch(_e){} }
    else{ document.dispatchEvent(new CustomEvent("bnz:pay-mounted",{detail:{button:btn}})); }
  }

  // Render de presupuesto
  BNZ.renderQuote=function(leg,{surcharge=0}={}){
    const miles=(leg?.distance?.value||0)/1609.34;
    let adjustedSurcharge=surcharge; if(isPickupSLCorJSX()) adjustedSurcharge=0;
    const base=baseFare(miles);
    const ds=document.getElementById("date")?.value||"", ts=document.getElementById("time")?.value||"";
    const ah=isAfterHours(ds,ts) ? (base+adjustedSurcharge)*AFTER_HOURS_PCT : 0;
    const mg=mgFee();
    const subtotal=base+adjustedSurcharge+ah+mg;
    const total=applyVehicle(subtotal);

    BNZ.state.last={ miles, base, surcharge:adjustedSurcharge, ah, mg, total, leg };
    publishTotals(BNZ.state.last);
    paintSummary(BNZ.state.last, leg);
    injectPayNow();
    enablePayIfReady();
  };

  function paintSummary(t,leg){
    const el=document.getElementById("info"); if(!el) return;
    const distTxt=t.miles.toFixed(1)+" mi"; const durTxt=leg?.duration?.text||"";
    const rows=[ t.surcharge>0? row("Distance Surcharge",t.surcharge):"",
                 t.ah>0?        row("After-Hours (25%)",t.ah):"",
                 t.mg>0?        row("Meet & Greet (SLC)",t.mg):"" ].filter(Boolean).join("");
    const cn=window.__lastCN || window.__reservationCode || "";

    const afterNote = (t.ah>0)
      ? `<div class="after-hours-note" role="note">Operating hours: <strong>7:00 AM – 10:00 PM</strong>. Rides outside this window incur an <strong>after-hours surcharge</strong>.</div>`
      : "";

    el.style.display="block";
    el.innerHTML=`
      <div class="trip-summary">
        <div class="ts-header">
          <div class="ts-title">Trip Summary</div>
          ${cn?`<div class="ts-confirm">Confirmation: <span class="code">${cn}</span></div>`:""}
        </div>

        <div class="kpis">
          <div class="kpi"><div class="label">Distance</div><div class="value">${distTxt}</div></div>
          <div class="kpi"><div class="label">Duration</div><div class="value">${durTxt}</div></div>
          <div class="kpi"><div class="label">Price</div><div class="value">$${t.total.toFixed(2)}</div></div>
        </div>

        ${rows?`<div class="divider"></div><div class="breakdown">${rows}</div>`:""}
        ${afterNote}

        <!-- Promo code — fila compacta entre breakdown y total -->
        <div class="promo" id="promoBox" aria-label="Promo code">
          <div class="promo-row">
            <div class="promo-label">Promo Code</div>
            <div class="promo-field">
              <input id="promoCode" class="promo-input" inputmode="text" autocomplete="off" />
              <button id="applyPromo" class="promo-btn" type="button">Apply</button>
            </div>
          </div>
          <div id="promoMsg" class="hint promo-msg" aria-live="polite"></div>
        </div>

        <div class="ts-total">
          <span>Total</span><span>$${t.total.toFixed(2)}</span>
        </div>
        <div class="tax-note">Taxes & gratuity included</div>
      </div>
    `;

    function row(label,val){
      return `<div class="row"><span>${label}</span><span>$${val.toFixed(2)}</span></div>`;
    }

    // Promo logic
    (function wirePromo(){
      const input = document.getElementById("promoCode");
      const btn   = document.getElementById("applyPromo");
      const msg   = document.getElementById("promoMsg");
      if (!input || !btn) return;

      input.setAttribute("placeholder","");
      function fmt(x){ return `$${x.toFixed(2)}`; }

      btn.onclick = function(){
        const code = String(input.value||"").trim().toLowerCase();
        if (!code){ msg.textContent="Enter a code."; return; }
        if (window.__promoAppliedOnce){ msg.textContent="Promo already applied for this session."; return; }
        if (code !== "bonanza10"){ msg.textContent="Invalid code."; return; }

        const last = BNZ.state.last;
        if (!last){ msg.textContent="Calculate price first."; return; }

        const discounted = Math.round(last.total * 0.90);
        BNZ.state.last.total = discounted;
        publishTotals(BNZ.state.last);

        const kpisPrice = document.querySelector("#info .kpis .kpi:nth-child(3) .value");
        const totalEl   = document.querySelector("#info .ts-total span:last-child");
        if (kpisPrice) kpisPrice.textContent = fmt(discounted);
        if (totalEl)   totalEl.textContent   = fmt(discounted);

        msg.textContent = "10% off applied.";
        window.__promoAppliedOnce = true;
        input.disabled = true; btn.disabled = true;
      };
    })();
  }

  // ====== Terms (solo visual; NO bloqueo) ======
  const acceptPill=document.getElementById("acceptPill");
  const termsBox=document.getElementById("termsBox");
  const termsSummary=document.querySelector("#termsBox .terms-summary");
  const acceptLabel=document.querySelector("#termsBox .accept-label");
  const calcBtn=document.getElementById("calculate");
  let payBtn=document.getElementById("pay");

  // Siempre “aceptado” para efectos de flujo
  function isAccepted(){ return true; }

  // Mantener compatibilidad con estilos/aria pero sin bloquear
  function setAccepted(on){
    // opcional: reflejar ON para apariencia
    if(acceptPill){
      acceptPill.classList.toggle("on", true);
      acceptPill.setAttribute("aria-checked","true");
    }
    syncButtons();
  }
  function syncButtons(){
    if(calcBtn) calcBtn.disabled = false;   // SIEMPRE habilitado
    enablePayIfReady();
  }
  function enablePayIfReady(){
    payBtn = payBtn || document.getElementById("pay");
    const ready=!!window.__lastQuotedTotal; // sin check de T&C
    if(payBtn){ payBtn.disabled=!ready; payBtn.style.opacity=ready?1:.5; payBtn.style.cursor=ready?"pointer":"not-allowed"; }
  }

  // (Dejamos los listeners por accesibilidad, pero no afectan el flujo)
  const shouldToggle=(e)=>!e.target.closest("a");
  const toggleAccept=(e)=>{ if(shouldToggle(e)){ e.stopPropagation(); setAccepted(true); } };
  ["click","pointerup","touchend"].forEach(evt=>{
    acceptPill?.addEventListener(evt,toggleAccept,{passive:true});
    termsSummary?.addEventListener(evt,toggleAccept,{passive:true});
    termsBox?.addEventListener(evt,toggleAccept,{passive:true});
    acceptLabel?.addEventListener(evt,toggleAccept,{passive:true});
  });
  const kbd=(e)=>{ if(e.key===" "||e.key==="Enter"){ if(e.target.closest("a"))return; e.preventDefault(); setAccepted(true); } };
  acceptPill?.addEventListener("keydown",kbd);
  termsSummary?.addEventListener("keydown",kbd);

  // Vehículo
  (function wireVehicle(){
    const btns=document.querySelectorAll(".veh-btn");
    const img=document.querySelector(".turntable .car");
    const cap=document.querySelector(".turntable .vehicle-caption");
    const initiallyActive=Array.from(btns).find(b=>b.classList.contains("active"));
    if(initiallyActive) BNZ.state.vehicle=initiallyActive.dataset.type||"suv";
    btns.forEach(b=>{
      b.addEventListener("click",()=>{
        btns.forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        BNZ.state.vehicle=b.dataset.type||"suv";
        if(BNZ.state.vehicle==="suv"){ if(img) img.src=SUV_IMG; if(cap) cap.textContent="SUV — Max 5 passengers, 5 suitcases"; }
        else{ if(img) img.src=VAN_IMG; if(cap) cap.textContent="Van — Up to 12 passengers, luggage varies"; }
        mgSyncCard(); flightSyncUI();
        if(BNZ.state.last){ BNZ.renderQuote(BNZ.state.last.leg, {surcharge:BNZ.state.last.surcharge}); }
      });
    });
  })();

  // Meet & Greet
  (function wireMG(){
    const card=document.getElementById("meetGreetCard"); if(!card) return;
    const btns=card.querySelectorAll(".mg-btn");
    btns.forEach(b=>{
      const on=(b.dataset.choice||"none")===BNZ.state.mgChoice;
      b.classList.toggle("active",on); b.setAttribute("aria-pressed",String(on)); b.setAttribute("tabindex","0");
      b.addEventListener("click",()=>{
        BNZ.state.mgChoice=b.dataset.choice||"none";
        btns.forEach(x=>{ const on2=x.dataset.choice===BNZ.state.mgChoice; x.classList.toggle("active",on2); x.setAttribute("aria-pressed",String(on2)); });
        if(BNZ.state.last){ BNZ.renderQuote(BNZ.state.last.leg, {surcharge:BNZ.state.last.surcharge}); }
      });
    });
    mgSyncCard();
  })();

  // Calculate (sin bloqueo de T&C)
  const handleCalculate=async ()=>{
    const need=["fullname","phone","email","pickup","dropoff","date","time"];
    const missing=need.filter(id=>{ const el=document.getElementById(id); const empty=!el||!el.value||!String(el.value).trim(); if(el) el.classList.toggle("invalid",empty); return empty; });
    if(missing.length){ alert("Please complete all required fields."); return; }
    const dt=selectedDateTime(); if(!atLeast24h(dt)){ alert("Please choose Date & Time at least 24 hours in advance."); return; }

    const cat=pickupCategory();
    const flightNumberEl=document.getElementById("flightNumber");
    const originCityEl  =document.getElementById("flightOrigin");
    const tailNumberEl  =document.getElementById("tailNumber");
    const fboCityEl     =document.getElementById("fboCity");

    let flightNumber=flightNumberEl?.value?.trim();
    let originCity  =originCityEl?.value?.trim();
    let tailNumber  =tailNumberEl?.value?.trim();
    let privCity    =fboCityEl?.value?.trim();

    if(flightNumber) flightNumber=flightNumber.replace(/\s+/g,"").toUpperCase();
    if(tailNumber)   tailNumber  =tailNumber.replace(/\s+/g,"").toUpperCase();

    if(document.activeElement?.blur) document.activeElement.blur();

    document.dispatchEvent(new CustomEvent("bnz:calculate",{
      detail:{ flight:{ cat, flightNumber, originCity:originCity||privCity||"", privateCity:privCity||"", tailNumber, verified:false, verification:null } }
    }));
  };
  document.getElementById("calculate")?.addEventListener("click",handleCalculate);

  // Init
  document.addEventListener("DOMContentLoaded",()=>{
    ensureMin24h();
    // Visualmente marcamos el pill como ON (pero no bloquea nada)
    if(acceptPill){ acceptPill.classList.add("on"); acceptPill.setAttribute("aria-checked","true"); }
    mgSyncCard(); flightSyncUI();
    syncButtons(); // habilita Calculate Price desde el inicio
  });
})();

/* booking.js — Bonanza GPS (UI + pricing + reglas de negocio) */
(function(){
  "use strict";

  // ────────────────────────────────────────────────────────────
  // Configuración
  // ────────────────────────────────────────────────────────────
  const OPERATING_START = "06:00";
  const OPERATING_END   = "23:00";
  const AFTER_HOURS_PCT = 0.25;
  const MG_FEE_USD      = 50;
  const VAN_MULTIPLIER  = 1.30;

  const SUV_IMG = "/images/suburban.png";
  const VAN_IMG = "/images/van-sprinter.png";

  // ────────────────────────────────────────────────────────────
  // Estado
  // ────────────────────────────────────────────────────────────
  const BNZ = window.BNZ = window.BNZ || {};
  BNZ.state = BNZ.state || { vehicle:"suv", mgChoice:"none", last:null };

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────
  function publishTotals(t){
    window.__lastQuotedTotal   = t.total;
    window.__lastDistanceMiles = t.miles;
    window.__vehicleType       = BNZ.state.vehicle;
  }
  function baseFare(miles){
    if (miles <= 10) return 120;
    if (miles <= 35) return 190;
    if (miles <= 39) return 210;
    if (miles <= 48) return 230;
    if (miles <= 55) return 250;
    return miles * 5.4;
  }
  function applyVehicle(total){
    return BNZ.state.vehicle === "van" ? Math.round(total*VAN_MULTIPLIER) : Math.round(total);
  }
  function nextQuarter(d){ const m=d.getMinutes(); const add=15-(m%15||15); d.setMinutes(m+add,0,0); return d; }
  function earliestAllowed(){ return nextQuarter(new Date(Date.now()+24*60*60*1000)); }
  function localISO(d){ const off=d.getTimezoneOffset()*60000; return new Date(d-off).toISOString().slice(0,10); }
  function ensureMin24h(){
    const dEl=document.getElementById("date"), tEl=document.getElementById("time");
    const min=earliestAllowed();
    if (dEl){ dEl.min=localISO(min); if(!dEl.value) dEl.value=localISO(min); }
    if (tEl && !tEl.value){
      tEl.value=String(min.getHours()).padStart(2,"0")+":"+String(min.getMinutes()).padStart(2,"0");
    }
  }
  function selectedDateTime(){
    const ds=document.getElementById("date")?.value;
    const ts=document.getElementById("time")?.value;
    if(!ds||!ts) return null;
    return new Date(`${ds}T${ts}:00`);
  }
  function atLeast24h(dt){ return dt && (dt.getTime()-Date.now() >= 24*60*60*1000); }
  function isAfterHours(dateStr,timeStr){
    if(!dateStr||!timeStr) return false;
    const d=new Date(`${dateStr}T${timeStr}:00`);
    const [sh,sm]=OPERATING_START.split(":").map(Number);
    const [eh,em]=OPERATING_END.split(":").map(Number);
    const start=new Date(d); start.setHours(sh,sm,0,0);
    const end=new Date(d); end.setHours(eh,em,0,0);
    return (d<start)||(d>end);
  }

  // ────────────────────────────────────────────────────────────
  // Meet & Greet
  // ────────────────────────────────────────────────────────────
  function mgShouldShow(){
    if (BNZ.state.vehicle!=="suv") return false;
    const hasPlace=!!window.pickupPlace;
    const okByPlace=hasPlace && typeof window.isSLCInternational==="function" &&
      window.isSLCInternational(window.pickupPlace);
    return okByPlace;
  }
  function mgFee(){ return BNZ.state.mgChoice!=="none" ? MG_FEE_USD : 0; }
  function mgSyncCard(){
    const card=document.getElementById("meetGreetCard");
    if(!card) return;
    if (mgShouldShow()){ card.style.display="block"; }
    else { card.style.display="none"; BNZ.state.mgChoice="none"; }
    card.querySelectorAll(".mg-btn")?.forEach(b=>{
      const on=(b.dataset.choice||"none")===BNZ.state.mgChoice;
      b.classList.toggle("active",on);
      b.setAttribute("aria-pressed",String(on));
    });
  }
  BNZ.onPickupPlaceChanged=()=>mgSyncCard();
  window.updateMeetGreetVisibility=mgSyncCard;
  window.recalcFromCache=()=>{
    if (BNZ.state.last){
      BNZ.renderQuote(BNZ.state.last.leg,{surcharge:BNZ.state.last.surcharge});
    }
  };

  // ────────────────────────────────────────────────────────────
  // Render de quote
  // ────────────────────────────────────────────────────────────
  BNZ.renderQuote=function(leg,{surcharge=0}={}){
    const miles=(leg?.distance?.value||0)/1609.34;
    const base=baseFare(miles);
    const dateV=document.getElementById("date")?.value||"";
    const timeV=document.getElementById("time")?.value||"";
    const ah=isAfterHours(dateV,timeV)?(base+surcharge)*AFTER_HOURS_PCT:0;
    const mg=mgFee();
    const subtotal=base+surcharge+ah+mg;
    const total=applyVehicle(subtotal);
    BNZ.state.last={miles,base,surcharge,ah,mg,total,leg};
    publishTotals(BNZ.state.last);
    paintSummary(BNZ.state.last,leg);
    enablePayIfReady();
  };
  function paintSummary(t,leg){
    const el=document.getElementById("info");
    if(!el) return;
    el.style.display="block";
    el.innerHTML=`<div>Distance: ${t.miles.toFixed(1)} mi</div>
                  <div>Price: $${t.total.toFixed(2)}</div>`;
  }

  // ────────────────────────────────────────────────────────────
  // Terms & Conditions (toggle)
  // ────────────────────────────────────────────────────────────
  const acceptPill=document.getElementById("acceptPill");
  const termsSummary=document.querySelector("#termsBox .terms-summary");
  const calcBtn=document.getElementById("calculate");
  const payBtn=document.getElementById("pay");

  function isAccepted(){
    return acceptPill?.classList.contains("on") ||
           acceptPill?.getAttribute("aria-checked")==="true";
  }
  function setAccepted(on){
    if(!acceptPill) return;
    acceptPill.classList.toggle("on",on);
    acceptPill.setAttribute("aria-checked",on?"true":"false");
    syncButtons();
  }
  function syncButtons(){
    if (calcBtn) calcBtn.disabled=!isAccepted();
    enablePayIfReady();
  }
  function enablePayIfReady(){
    const ready=!!window.__lastQuotedTotal && isAccepted();
    if (payBtn){
      payBtn.style.display="block";
      payBtn.disabled=!ready;
    }
  }

  // 👉 Aquí el fix: solo un listener de click, ignora si clic en link
  function toggleAccept(e){
    if (e.target.closest("a")) return;
    setAccepted(!isAccepted());
  }
  termsSummary?.addEventListener("click",toggleAccept);
  acceptPill?.addEventListener("click",toggleAccept);

  // ────────────────────────────────────────────────────────────
  // Vehicle toggle
  // ────────────────────────────────────────────────────────────
  (function wireVehicle(){
    const btns=document.querySelectorAll(".veh-btn");
    const img=document.querySelector(".turntable .car");
    const cap=document.querySelector(".turntable .vehicle-caption");
    btns.forEach(b=>{
      b.addEventListener("click",()=>{
        btns.forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        BNZ.state.vehicle=b.dataset.type||"suv";
        if(BNZ.state.vehicle==="suv"){ if(img) img.src=SUV_IMG; if(cap) cap.textContent="SUV — Max 5 passengers"; }
        else { if(img) img.src=VAN_IMG; if(cap) cap.textContent="Van — Up to 12 passengers"; }
        mgSyncCard();
        if(BNZ.state.last){ BNZ.renderQuote(BNZ.state.last.leg,{surcharge:BNZ.state.last.surcharge}); }
      });
    });
  })();

  // ────────────────────────────────────────────────────────────
  // Calculate
  // ────────────────────────────────────────────────────────────
  const handleCalculate=()=>{
    if (!isAccepted()){ alert("Please accept Terms first."); return; }
    const need=["fullname","phone","email","pickup","dropoff","date","time"];
    const missing=need.filter(id=>!document.getElementById(id)?.value?.trim());
    if(missing.length){ alert("Please complete all required fields."); return; }
    const dt=selectedDateTime();
    if(!atLeast24h(dt)){ alert("Please choose Date & Time at least 24h in advance."); return; }
    document.dispatchEvent(new CustomEvent("bnz:calculate"));
  };
  calcBtn?.addEventListener("click",handleCalculate);

  // ────────────────────────────────────────────────────────────
  // On load
  // ────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded",()=>{
    ensureMin24h();
    setAccepted(false);
    mgSyncCard();
  });
})();

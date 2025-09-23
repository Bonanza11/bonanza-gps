/* =========================================================
   Archivo: booking.js
   Rol:
     - Pricing (base + vehicle + after-hours + meet&greet)
     - Terms toggle
     - Luggage accordion
     - Mostrar resumen del viaje
   ========================================================= */
window.BNZ = window.BNZ || {};

/* --- Pricing --- */
BNZ.calculateBase = mi=>{
  if (mi<=10) return 120;
  if (mi<=35) return 190;
  if (mi<=39) return 210;
  if (mi<=48) return 230;
  if (mi<=55) return 250;
  return mi*5.4;
};
BNZ.applyVehicleMultiplier = (total,vehicle)=> vehicle==='van'?Math.round(total*1.30):total;

/* --- Meet & Greet --- */
BNZ.mgChoice="none";
BNZ.getMGFee=()=> BNZ.mgChoice==="none"?0:50;
document.querySelectorAll(".mg-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    BNZ.mgChoice=btn.dataset.choice;
    document.querySelectorAll(".mg-btn").forEach(x=>x.classList.toggle("active",x===btn));
  });
});

/* --- Terms toggle --- */
(function(){
  const pill=document.getElementById("acceptPill");
  const calc=document.getElementById("calculate");
  const pay=document.getElementById("pay");
  if(pill){
    const sync=()=>{
      calc.disabled=!pill.classList.contains("on");
      pay.disabled=!pill.classList.contains("on");
    };
    pill.addEventListener("click",()=>{pill.classList.toggle("on");sync();});
    sync();
  }
})();

/* --- Luggage accordion --- */
document.querySelectorAll(".luggage-accordion").forEach(acc=>{
  const sum=acc.querySelector(".luggage-summary");
  sum?.addEventListener("click",()=> acc.classList.toggle("open"));
});

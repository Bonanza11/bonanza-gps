/* =========================================================
   Archivo: core.js
   Ubicación: /public/app/scripts/core.js
   Rol:
     - Configuración global y constantes
     - Utilidades de fecha/hora/formatos
     - Validaciones básicas de formulario
   ========================================================= */
window.BNZ = window.BNZ || {};

/* --- Configuración global --- */
Object.assign(window.BNZ, {
  SUV_IMG: "/images/suburban.png",
  VAN_IMG: "/images/van-sprinter.png",
  BASE_ADDRESS: "13742 N Jordanelle Pkwy, Kamas, UT",
  FLIGHTCHECK_URL: "https://flightcheck-7728622851.us-west3.run.app/flight",
  OPERATING_START: "06:00",
  OPERATING_END:   "23:00",
  STRIPE_PK: "pk_test_51Rr9g0LxdVPME4zrpMHQ6iMQfdhpgwwb4EeluF5zGj0yKgspPu3KPm0Zogu6WvRhWcMx7BagtJQPGqwH6PUJGpG300QcSfhJmp"
});

/* --- Utils de fecha/hora --- */
BNZ.nextQuarter = function(d){
  const m=d.getMinutes(); const add=15-(m%15||15);
  d.setMinutes(m+add,0,0); return d;
};
BNZ.localISODate = d=>{
  const off=d.getTimezoneOffset()*60000;
  return new Date(d-off).toISOString().slice(0,10);
};
BNZ.earliestAllowedDt = ()=> BNZ.nextQuarter(new Date(Date.now()+24*60*60*1000));
BNZ.setTimeValue = (el,h,m)=>{ if(el) el.value=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };
BNZ.isAfterHours = (dateStr,timeStr)=>{
  if(!dateStr||!timeStr) return false;
  const d=new Date(`${dateStr}T${timeStr}:00`);
  const [sh,sm]=BNZ.OPERATING_START.split(':').map(Number);
  const [eh,em]=BNZ.OPERATING_END.split(':').map(Number);
  const start=new Date(d); start.setHours(sh,sm,0,0);
  const end=new Date(d); end.setHours(eh,em,0,0);
  return (d<start)||(d>end);
};

/* --- Validaciones --- */
BNZ.requiredFields = ['fullname','phone','email','pickup','dropoff','date','time'];
BNZ.validateForm = ()=>{
  let ok=true;
  BNZ.requiredFields.forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(!el.value.trim()){ el.classList.add("invalid"); ok=false; }
    else { el.classList.remove("invalid"); }
  });
  return ok;
};
document.getElementById("calculate")?.addEventListener("click",e=>{
  if(!BNZ.validateForm()){ e.preventDefault(); alert("Please complete all required fields."); }
});

/* flightcheck.js — cliente ligero para el servicio de vuelos en Cloud Run */
(function(){
  "use strict";

  const FC_URL = (window.__PUBLIC_CFG__ && window.__PUBLIC_CFG__.FLIGHTCHECK_URL) || "";

  async function lookupFlight(number, origin){
    if (!FC_URL) return { ok:false, error:"FLIGHTCHECK_URL not configured" };
    const params = new URLSearchParams({
      number: (number || "").trim(),
      origin: (origin || "").trim()
    });
    try{
      const res = await fetch(FC_URL + "?" + params.toString(), {
        method: "GET", mode: "cors", headers: { "Accept":"application/json" }
      });
      if (!res.ok) return { ok:false, error:"http_"+res.status };
      const data = await res.json();
      return data; // esperado: { ok:true, flight:{ number, origin, schedArrival, estArrival, status, airline } }
    }catch(err){
      return { ok:false, error:String(err && err.message || err) };
    }
  }

  // expone en window
  window.lookupFlight = lookupFlight;
})();

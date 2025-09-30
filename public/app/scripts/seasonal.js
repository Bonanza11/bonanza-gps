// seasonal.js — Partículas por temporada (Utah, fijo por mes)
(function(){
  "use strict";

  // Permite apagar con ?season=off
  const qp = new URLSearchParams(location.search);
  if (qp.get("season")==="off") return;

  // Respeta reduced motion
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Utah (Hemisferio Norte): Invierno (Dic–Feb), Primavera (Mar–May), Verano (Jun–Ago), Otoño (Sep–Nov)
  const m = (new Date()).getMonth(); // 0=Ene … 11=Dic
  const season = (m === 11 || m === 0 || m === 1) ? "winter"   // Dic, Ene, Feb
               : (m >= 2  && m <= 4)               ? "spring"   // Mar, Abr, May
               : (m >= 5  && m <= 7)               ? "summer"   // Jun, Jul, Ago
               :                                     "fall";     // Sep, Oct, Nov

  // Canvas
  const c = document.createElement("canvas");
  c.className = "seasonal-canvas";
  document.body.appendChild(c);
  const ctx = c.getContext("2d", { alpha:true });

  let W=0, H=0, dpr=1;
  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = c.clientWidth; H = c.clientHeight;
    c.width  = Math.floor(W*dpr);
    c.height = Math.floor(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  addEventListener("resize", resize);

  // Densidad adaptativa
  const base = Math.min(80, Math.max(28, Math.floor(W/20)));
  const COUNT = season==="winter" ? base+12
              : season==="spring" ? base
              : season==="summer" ? Math.floor(base*0.8)
              :                     base+6;

  // Utilidades
  const rnd = (a,b)=> a + Math.random()*(b-a);
  const leafColors = ["#c58b41","#a86b2d","#8b5720","#7a4a1a","#d19a57"];
  const petalColors= ["#ffd1dc","#ffe4f0","#ffd8a8","#e6f7ff","#ffe8b3"];
  const sparkColors= ["#ffe7b0","#ffd27e","#fff0c9","#ffe0a1"];
  const snowColors = ["rgba(255,255,255,.95)","rgba(255,255,255,.85)","rgba(230,240,255,.9)"];

  function makeParticle(){
    const x = rnd(0,W), y = rnd(-H,0);
    const s  = season==="winter" ? rnd(1.2,3.2)
              : season==="spring" ? rnd(1.1,2.6)
              : season==="summer" ? rnd(1.0,2.2)
              :                     rnd(1.2,3.0);
    const vx = season==="winter" ? rnd(-0.35,0.65)
              : season==="spring" ? rnd(-0.25,0.55)
              : season==="summer" ? rnd(-0.15,0.35)
              :                     rnd(-0.5,0.3);
    const vy = season==="winter" ? rnd(0.6,1.4)
              : season==="spring" ? rnd(0.5,1.2)
              : season==="summer" ? rnd(0.3,0.9)
              :                     rnd(0.7,1.5);
    const rot = rnd(0,Math.PI*2);
    const vr  = rnd(-0.02,0.02);
    let color, type;
    if (season==="winter"){ color=snowColors[Math|rnd(0,snowColors.length)]; type="snow"; }
    else if (season==="spring"){ color=petalColors[Math|rnd(0,petalColors.length)]; type="petal"; }
    else if (season==="summer"){ color=sparkColors[Math|rnd(0,sparkColors.length)]; type="spark"; }
    else { color=leafColors[Math|rnd(0,leafColors.length)]; type="leaf"; }
    return {x,y,s,vx,vy,rot,vr,color,type,t:rnd(0,Math.PI*2)};
  }

  const parts = Array.from({length:COUNT}, makeParticle);

  function drawSnow(p){
    ctx.beginPath(); ctx.fillStyle=p.color;
    ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill();
  }
  function drawPetal(p){
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.ellipse(0,0,p.s*1.6,p.s*0.9,0,0,Math.PI*2);
    ctx.fill(); ctx.restore();
  }
  function drawSpark(p){
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.strokeStyle=p.color; ctx.lineWidth=1;
    const r=p.s*2; ctx.beginPath();
    ctx.moveTo(-r,0); ctx.lineTo(r,0);
    ctx.moveTo(0,-r); ctx.lineTo(0,r);
    ctx.stroke(); ctx.restore();
  }
  function drawLeaf(p){
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.color;
    const w=p.s*2.2,h=p.s*3;
    ctx.beginPath();
    ctx.moveTo(0,-h/2);
    ctx.quadraticCurveTo(w/2,0,0,h/2);
    ctx.quadraticCurveTo(-w/2,0,0,-h/2);
    ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,.15)";
    ctx.lineWidth=.6;
    ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(0,h/2); ctx.stroke();
    ctx.restore();
  }

  let last=performance.now(), raf;
  function tick(now){
    const dt = Math.min(40, now-last)/16.666; last=now;
    ctx.clearRect(0,0,W,H);
    for (let p of parts){
      p.t += 0.01*dt;
      const wind = (season==="winter"||season==="fall") ? Math.sin(p.t)*0.2 : Math.sin(p.t)*0.1;
      p.x += (p.vx + wind)*dt;
      p.y += p.vy*dt;
      p.rot += p.vr*dt;
      if (p.y > H+20 || p.x < -20 || p.x > W+20){
        const np = makeParticle();
        p.x=np.x; p.y=-10; p.vx=np.vx; p.vy=np.vy; p.rot=np.rot; p.vr=np.vr; p.color=np.color; p.type=np.type; p.s=np.s; p.t=np.t;
      }
      if (p.type==="snow") drawSnow(p);
      else if (p.type==="petal") drawPetal(p);
      else if (p.type==="spark") drawSpark(p);
      else drawLeaf(p);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  addEventListener("beforeunload", ()=> cancelAnimationFrame(raf));
})();

// seasonal.js — Partículas por temporada (Utah, fechas fijas)
// Nieve forzada: del 15-Nov al 15-Abr (inclusive)
// Overrides por query:
//   ?season=winter|spring|summer|fall|off
//   &rmo=off  (ignora prefers-reduced-motion para pruebas)
(function(){
  "use strict";

  const qp = new URLSearchParams(location.search);

  // Apagar completamente
  if (qp.get("season") === "off") {
    console.info("[seasonal] disabled via ?season=off");
    return;
  }

  // Reduced motion (se puede ignorar con &rmo=off)
  const rmoOff = qp.get("rmo") === "off";
  const prefersReduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduce && !rmoOff) {
    console.info("[seasonal] prefers-reduced-motion is ON (no animation). Add &rmo=off to test.");
    return;
  }

  // ---- Determinar temporada ----
  const now = new Date();
  const m = now.getMonth(); // 0=Ene … 11=Dic
  const d = now.getDate();

  // Ventana de nieve: 15-Nov → 15-Abr
  const IN_SNOW_WINDOW =
    (m === 10 && d >= 15) || // Nov
    (m === 11) ||            // Dic
    (m === 0)  ||            // Ene
    (m === 1)  ||            // Feb
    (m === 2)  ||            // Mar
    (m === 3 && d <= 15);    // Abr

  const baseSeason =
    (m >= 2 && m <= 4) ? "spring" :
    (m >= 5 && m <= 7) ? "summer" :
    (m >= 8 && m <= 10) ? "fall" :
    "winter";

  const qSeason = (qp.get("season") || "").toLowerCase();
  const valid = { winter:1, spring:1, summer:1, fall:1 };
  const season = valid[qSeason] ? qSeason : (IN_SNOW_WINDOW ? "winter" : baseSeason);

  console.info("[seasonal] running — season:", season, valid[qSeason] ? "(forced by query)" : IN_SNOW_WINDOW ? "(snow window)" : "(by month)");

  // ---- Canvas ----
  const c = document.createElement("canvas");
  c.className = "seasonal-canvas";
  Object.assign(c.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "9998",
    opacity: "0.9"
  });
  document.body.appendChild(c);

  const ctx = c.getContext("2d", { alpha: true });
  if (!ctx) { console.warn("[seasonal] no 2D context"); return; }

  let W = 0, H = 0, dpr = 1;

  function resize(){
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)); // iMac/Retina OK
    W = Math.max(1, Math.floor(window.innerWidth  || document.documentElement.clientWidth  || 1));
    H = Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 1));
    c.width  = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  // ---------- Escalado visual ----------
  const isMobile = Math.min(W, H) <= 640;
  const isUltra  = Math.max(W, H) >= 1800;

  const SIZE_K = isMobile ? 1.9 : isUltra ? 1.25 : 1.0;

  // Densidad base
  let base = Math.min(90, Math.max(28, Math.floor(W / 20)));
  if (isUltra) base = Math.floor(base * 1.15);

  // Otoño: menos hojas para que se aprecie la forma
  const COUNT = season==="winter" ? base+12
              : season==="spring" ? base
              : season==="summer" ? Math.floor(base*0.85)
              : Math.floor(base*0.45); // fall

  // ---------- Utilidades y colores ----------
  const rnd = (a,b)=> a + Math.random()*(b-a);

  // Paleta ROJA para otoño (parecida a la foto)
  const mapleReds  = ["#b12a1d","#c43724","#d2432a","#de4f30","#e35a33","#b93a27"];
  const petalColors= ["#ffd1dc","#ffe4f0","#ffd8a8","#e6f7ff","#ffe8b3"];
  const sparkColors= ["#ffe7b0","#ffd27e","#fff0c9","#ffe0a1"];
  const snowColors = ["rgba(255,255,255,.95)","rgba(255,255,255,.85)","rgba(230,240,255,.9)"];

  function makeParticle(){
    const x = rnd(0, W), y = rnd(-H, 0);

    // Tamaños base * SIZE_K (otoño más grande)
    const s  = (season==="winter" ? rnd(1.2,3.2)
               : season==="spring" ? rnd(1.1,2.6)
               : season==="summer" ? rnd(1.0,2.2)
               : rnd(3.2,6.0)) * SIZE_K;   // fall grande

    // Velocidades
    const vBoost = isMobile ? 1.1 : 1.0;
    const vx = (season==="winter" ? rnd(-0.35,0.65)
              : season==="spring" ? rnd(-0.25,0.55)
              : season==="summer" ? rnd(-0.15,0.35)
              : rnd(-0.45,0.35)) * vBoost;

    const vy = (season==="winter" ? rnd(0.6,1.4)
              : season==="spring" ? rnd(0.5,1.2)
              : season==="summer" ? rnd(0.3,0.9)
              : rnd(0.7,1.5)) * vBoost;

    const rot = rnd(0, Math.PI*2);
    const vr  = rnd(-0.02, 0.02);

    let color, type;
    if (season==="winter"){ color = snowColors[Math|rnd(0,snowColors.length)]; type="snow"; }
    else if (season==="spring"){ color = petalColors[Math|rnd(0,petalColors.length)]; type="petal"; }
    else if (season==="summer"){ color = sparkColors[Math|rnd(0,sparkColors.length)]; type="spark"; }
    else { color = mapleReds[Math|rnd(0,mapleReds.length)]; type="leaf"; }

    return { x, y, s, vx, vy, rot, vr, color, type, t: rnd(0, Math.PI*2) };
  }

  const parts = Array.from({ length: COUNT }, makeParticle);

  function drawSnow(p){
    ctx.beginPath(); ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
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

  // ===== Hoja de MAPLE canadiense (5 lóbulos) =====
  // Contorno estilizado pero reconocible, con tallo y nervio central.
  function drawMapleLeaf(p){
    const s = p.s;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);

    // Relleno rojo con un pequeño gradiente para “vida”
    const g = ctx.createRadialGradient(0, -0.8*s, 0, 0, 0, 3.2*s);
    g.addColorStop(0, p.color);
    g.addColorStop(1, "#8c261e");
    ctx.fillStyle = g;

    // Contorno del maple (simétrico, con puntas marcadas)
    ctx.beginPath();
    ctx.moveTo(0, -3.3*s);            // punta central
    ctx.lineTo(0.6*s, -2.3*s);
    ctx.lineTo(1.6*s, -2.6*s);        // pico sup. derecho
    ctx.lineTo(1.0*s, -1.6*s);
    ctx.lineTo(1.9*s, -1.0*s);        // muesca
    ctx.lineTo(1.2*s, -0.5*s);
    ctx.lineTo(2.3*s, 0.0*s);         // pico medio derecho
    ctx.lineTo(1.2*s, 0.25*s);
    ctx.lineTo(1.7*s, 0.9*s);         // muesca ala
    ctx.lineTo(0.9*s, 1.0*s);
    ctx.lineTo(1.2*s, 1.7*s);         // pico ala inferior
    ctx.lineTo(0.6*s, 1.5*s);
    ctx.lineTo(0.4*s, 2.1*s);         // base
    ctx.lineTo(0.2*s, 2.7*s);
    ctx.lineTo(0, 2.9*s);             // tallo
    ctx.lineTo(-0.2*s, 2.7*s);
    ctx.lineTo(-0.4*s, 2.1*s);
    ctx.lineTo(-0.6*s, 1.5*s);
    ctx.lineTo(-1.2*s, 1.7*s);
    ctx.lineTo(-0.9*s, 1.0*s);
    ctx.lineTo(-1.7*s, 0.9*s);
    ctx.lineTo(-1.2*s, 0.25*s);
    ctx.lineTo(-2.3*s, 0.0*s);
    ctx.lineTo(-1.2*s, -0.5*s);
    ctx.lineTo(-1.9*s, -1.0*s);
    ctx.lineTo(-1.0*s, -1.6*s);
    ctx.lineTo(-1.6*s, -2.6*s);
    ctx.lineTo(-0.6*s, -2.3*s);
    ctx.closePath();
    ctx.fill();

    // Nervio central + contorno sutil
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -3.1*s); ctx.lineTo(0, 2.9*s); ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.restore();
  }

  let last = performance.now(), raf;
  function tick(now){
    const dt = Math.min(40, now - last) / 16.666; last = now;
    ctx.clearRect(0,0,W,H);
    for (let p of parts){
      p.t += 0.01 * dt;
      const wind = (season==="winter" || season==="fall") ? Math.sin(p.t)*0.2 : Math.sin(p.t)*0.1;
      p.x += (p.vx + wind) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      // Reposicionar cuando sale de pantalla
      if (p.y > H + 20 || p.x < -20 || p.x > W + 20){
        const np = makeParticle();
        p.x=np.x; p.y=-10; p.vx=np.vx; p.vy=np.vy; p.rot=np.rot; p.vr=np.vr; p.color=np.color; p.type=np.type; p.s=np.s; p.t=np.t;
      }

      if (p.type==="snow") drawSnow(p);
      else if (p.type==="petal") drawPetal(p);
      else if (p.type==="spark") drawSpark(p);
      else drawMapleLeaf(p);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  addEventListener("beforeunload", ()=> cancelAnimationFrame(raf));
})();

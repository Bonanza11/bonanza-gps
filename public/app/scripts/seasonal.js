// seasonal.js — Partículas por temporada (Utah, fechas fijas)
// Nieve forzada: del 15-Nov al 15-Abr (inclusive)
// Overrides por query:
//   ?season=winter|spring|summer|fall|off
//   &rmo=off  (ignora prefers-reduced-motion para pruebas)
//   &fallStyle=emoji|simple   (elige estilo para otoño)
(function(){
  "use strict";

  const qp = new URLSearchParams(location.search);

  // Apagar completamente
  if (qp.get("season") === "off") {
    console.info("[seasonal] disabled via ?season=off");
    return;
  }

  // Reduced-motion (se puede ignorar con &rmo=off)
  const rmoOff = qp.get("rmo") === "off";
  const prefersReduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduce && !rmoOff) {
    console.info("[seasonal] prefers-reduced-motion is ON (no animation). Add &rmo=off to test.");
    return;
  }

  // ---- Temporada ----
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
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.max(1, Math.floor(window.innerWidth  || document.documentElement.clientWidth  || 1));
    H = Math.max(1, Math.floor(window.innerHeight || document.documentElement.clientHeight || 1));
    c.width  = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  const isMobile = Math.min(W, H) <= 640;
  const isUltra  = Math.max(W, H) >= 1800;
  const SIZE_K   = isMobile ? 1.9 : isUltra ? 1.25 : 1.0;

  // Densidad base (otoño ahora a la MITAD: 0.20 en vez de 0.40)
  let base = Math.min(90, Math.max(28, Math.floor(W / 20)));
  if (isUltra) base = Math.floor(base * 1.15);
  const COUNT = season==="winter" ? base+12
              : season==="spring" ? base
              : season==="summer" ? Math.floor(base*0.85)
              : Math.floor(base*0.20); // ← fall (mitad)

  // Colores y utilidades (para otras estaciones)
  const rnd = (a,b)=> a + Math.random()*(b-a);
  const petalColors= ["#ffd1dc","#ffe4f0","#ffd8a8","#e6f7ff","#ffe8b3"];
  const sparkColors= ["#ffe7b0","#ffd27e","#fff0c9","#ffe0a1"];
  const snowColors = ["rgba(255,255,255,.95)","rgba(255,255,255,.85)","rgba(230,240,255,.9)"];

  // Estilo de otoño: default emoji 🍁/🍂
  const fallStyle = (qp.get("fallStyle") || "emoji").toLowerCase(); // emoji|simple

  function makeParticle(){
    const x = rnd(0, W), y = rnd(-H, 0);
    const isFall = season === "fall";

    let s, vx, vy, rot, vr, type, color, char;

    if (isFall && fallStyle === "emoji") {
      // Emoji grandes
      s   = rnd(22, 42) * SIZE_K;        // tamaño en px (fontSize)
      vx  = rnd(-0.35, 0.25);
      vy  = rnd(0.6, 1.3);
      rot = rnd(-0.6, 0.6);
      vr  = rnd(-0.005, 0.005);
      type= "leafEmoji";
      char= Math.random() < 0.55 ? "🍁" : "🍂";
      color = "#000";
    } else if (isFall && fallStyle === "simple") {
      // Alternativa simple
      s   = rnd(3.0, 5.8) * SIZE_K;
      vx  = rnd(-0.45,0.35);
      vy  = rnd(0.7,1.5);
      rot = rnd(0, Math.PI*2);
      vr  = rnd(-0.02, 0.02);
      type= "leafSimple";
      color = ["#b12a1d","#c43724","#d2432a","#de4f30","#e35a33","#b93a27"][Math|rnd(0,6)];
    } else {
      // Otras estaciones
      s   = (season==="winter" ? rnd(1.2,3.2)
           : season==="spring" ? rnd(1.1,2.6)
           : rnd(1.0,2.2)) * SIZE_K;
      vx  = (season==="winter" ? rnd(-0.35,0.65)
           : season==="spring" ? rnd(-0.25,0.55)
           : rnd(-0.15,0.35)) * (isMobile ? 1.1 : 1.0);
      vy  = (season==="winter" ? rnd(0.6,1.4)
           : season==="spring" ? rnd(0.5,1.2)
           : rnd(0.3,0.9)) * (isMobile ? 1.1 : 1.0);
      rot = rnd(0, Math.PI*2);
      vr  = rnd(-0.02, 0.02);
      if (season==="winter"){ color = snowColors[Math|rnd(0,snowColors.length)]; type="snow"; }
      else if (season==="spring"){ color = petalColors[Math|rnd(0,petalColors.length)]; type="petal"; }
      else { color = sparkColors[Math|rnd(0,sparkColors.length)]; type="spark"; }
    }

    return { x, y, s, vx, vy, rot, vr, color, type, t: rnd(0, Math.PI*2), char };
  }

  const parts = Array.from({ length: COUNT }, makeParticle);

  // Dibujadores
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
  function drawLeafSimple(p){
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.ellipse(0,0,p.s*2.1,p.s*1.3,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawLeafEmoji(p){
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur  = 6;
    ctx.shadowOffsetY = 1;
    ctx.font = `${Math.max(16, p.s)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.char || "🍁", 0, 0);
    ctx.shadowColor = "transparent";
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

      if (p.y > H + 40 || p.x < -40 || p.x > W + 40){
        const np = makeParticle();
        p.x=np.x; p.y=-10; p.vx=np.vx; p.vy=np.vy; p.rot=np.rot; p.vr=np.vr;
        p.color=np.color; p.type=np.type; p.s=np.s; p.t=np.t; p.char=np.char;
      }

      if (p.type==="snow") drawSnow(p);
      else if (p.type==="petal") drawPetal(p);
      else if (p.type==="spark") drawSpark(p);
      else if (p.type==="leafEmoji") drawLeafEmoji(p);
      else drawLeafSimple(p);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  addEventListener("beforeunload", ()=> cancelAnimationFrame(raf));
})();

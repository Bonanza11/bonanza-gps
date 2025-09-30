// public/app/scripts/seasonal.js
// Partículas estacionales para Bonanza (UT). Nieve forzada del 15 de Nov al 15 de Abr.
(function () {
  "use strict";

  // ===== Config & helpers =====
  const qp = new URLSearchParams(location.search);
  const qSeason = (qp.get("season") || "").toLowerCase().trim();

  // Apagado manual: ?season=off
  if (qSeason === "off") return;

  // Respeta accesibilidad
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Forzar temporada por query (para probar)
  const FORCE = (["winter", "spring", "summer", "fall"].includes(qSeason)) ? qSeason : null;

  // Ventana de nieve fija (UT): 15 Nov → 15 Abr (inclusive)
  const now = new Date();
  const m = now.getMonth();  // 0=Ene…11=Dic
  const d = now.getDate();
  const IN_SNOW_WINDOW =
    (m === 10 && d >= 15) || // Nov
    (m === 11) ||            // Dic
    (m === 0)  ||            // Ene
    (m === 1)  ||            // Feb
    (m === 2)  ||            // Mar
    (m === 3 && d <= 15);    // Abr

  // Temporada base por mes (si no hay nieve forzada)
  const baseSeason =
    (m >= 2 && m <= 4)  ? "spring" :
    (m >= 5 && m <= 7)  ? "summer" :
    (m >= 8 && m <= 10) ? "fall"   :
                          "winter";

  const season = FORCE || (IN_SNOW_WINDOW ? "winter" : baseSeason);

  // ===== Canvas overlay =====
  const c = document.createElement("canvas");
  c.className = "seasonal-canvas";
  c.setAttribute("aria-hidden", "true"); // puramente decorativo
  // El z-index y pointer-events se controlan en CSS (.seasonal-canvas)
  document.body.appendChild(c);

  const ctx = c.getContext("2d", { alpha: true });
  if (!ctx) return;

  let W = 0, H = 0, dpr = 1;

  function resize() {
    // Límite de DPR a 2 para no disparar el uso de memoria en móviles
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    // El tamaño visual lo fija el CSS (fixed + inset:0),
    // usamos clientWidth/Height para resolver barras y notches.
    W = c.clientWidth;
    H = c.clientHeight;
    c.width  = Math.max(1, Math.floor(W * dpr));
    c.height = Math.max(1, Math.floor(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Evita reflows en cascada con un raf simple
  let resizeRAF = 0;
  function queueResize() {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = 0;
      resize();
    });
  }

  resize();
  addEventListener("resize", queueResize);
  addEventListener("orientationchange", queueResize);

  // ===== Partículas =====
  const rnd = (a, b) => a + Math.random() * (b - a);

  const leafColors  = ["#c58b41","#a86b2d","#8b5720","#7a4a1a","#d19a57"];
  const petalColors = ["#ffd1dc","#ffe4f0","#ffd8a8","#e6f7ff","#ffe8b3"];
  const sparkColors = ["#ffe7b0","#ffd27e","#fff0c9","#ffe0a1"];
  const snowColors  = ["rgba(255,255,255,.95)","rgba(255,255,255,.85)","rgba(230,240,255,.9)"];

  // Densidad adaptativa (menos en pantallas pequeñas)
  const isSmall = Math.min(screen.width, screen.height) <= 480;
  const baseCount = Math.min(80, Math.max(24, Math.floor(window.innerWidth / 22)));
  const COUNT = (season === "winter") ? baseCount + (isSmall ? 6 : 14)
              : (season === "spring") ? baseCount
              : (season === "summer") ? Math.floor(baseCount * 0.8)
              :                           baseCount + (isSmall ? 4 : 10);

  function makeParticle() {
    const x  = rnd(0, W);
    const y  = rnd(-H, 0);
    const s  = (season === "winter") ? rnd(1.2, 3.2)
             : (season === "spring") ? rnd(1.1, 2.6)
             : (season === "summer") ? rnd(1.0, 2.2)
             :                         rnd(1.2, 3.0);

    const vx = (season === "winter") ? rnd(-0.35, 0.65)
             : (season === "spring") ? rnd(-0.25, 0.55)
             : (season === "summer") ? rnd(-0.15, 0.35)
             :                         rnd(-0.50, 0.30);

    const vy = (season === "winter") ? rnd(0.60, 1.40)
             : (season === "spring") ? rnd(0.50, 1.20)
             : (season === "summer") ? rnd(0.30, 0.90)
             :                         rnd(0.70, 1.50);

    const rot = rnd(0, Math.PI * 2);
    const vr  = rnd(-0.02, 0.02);

    let color, type;
    if (season === "winter") {
      color = snowColors[(Math.random() * snowColors.length) | 0]; type = "snow";
    } else if (season === "spring") {
      color = petalColors[(Math.random() * petalColors.length) | 0]; type = "petal";
    } else if (season === "summer") {
      color = sparkColors[(Math.random() * sparkColors.length) | 0]; type = "spark";
    } else {
      color = leafColors[(Math.random() * leafColors.length) | 0];  type = "leaf";
    }

    return { x, y, s, vx, vy, rot, vr, color, type, t: rnd(0, Math.PI * 2) };
  }

  const parts = Array.from({ length: COUNT }, makeParticle);

  // Dibujadores
  function drawSnow(p) {
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s * 1.6, p.s * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpark(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    const r = p.s * 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();
  }

  function drawLeaf(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    const w = p.s * 2.2, h = p.s * 3;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.quadraticCurveTo(w / 2, 0, 0, h / 2);
    ctx.quadraticCurveTo(-w / 2, 0, 0, -h / 2);
    ctx.fill();
    // nervadura suave
    ctx.strokeStyle = "rgba(0,0,0,.15)";
    ctx.lineWidth = .6;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
    ctx.restore();
  }

  // ===== Animación =====
  let last = performance.now();
  let raf = 0;
  let paused = false;

  function step(now) {
    const dt = Math.min(40, now - last) / 16.666; // normaliza a ~60fps
    last = now;

    ctx.clearRect(0, 0, W, H);

    for (let p of parts) {
      p.t += 0.01 * dt;
      const wind = (season === "winter" || season === "fall") ? Math.sin(p.t) * 0.2 : Math.sin(p.t) * 0.1;
      p.x += (p.vx + wind) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      // reciclaje al salir
      if (p.y > H + 20 || p.x < -20 || p.x > W + 20) {
        const np = makeParticle();
        p.x = np.x; p.y = -10;
        p.vx = np.vx; p.vy = np.vy;
        p.rot = np.rot; p.vr = np.vr;
        p.color = np.color; p.type = np.type; p.s = np.s; p.t = np.t;
      }

      if (p.type === "snow")       drawSnow(p);
      else if (p.type === "petal") drawPetal(p);
      else if (p.type === "spark") drawSpark(p);
      else                         drawLeaf(p);
    }

    if (!paused) raf = requestAnimationFrame(step);
  }

  function start() {
    if (paused) { paused = false; last = performance.now(); raf = requestAnimationFrame(step); }
  }
  function stop() {
    paused = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // Pausa cuando la pestaña no está visible (ahorra batería)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  // Inicia
  raf = requestAnimationFrame(step);

  // Limpia al salir
  addEventListener("beforeunload", () => { if (raf) cancelAnimationFrame(raf); });
})();

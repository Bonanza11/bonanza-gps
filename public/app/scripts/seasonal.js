<script>
// seasonal.js — partículas por temporada (canvas).
(function(){
  "use strict";

  // Permite apagar: ?season=off
  const qp = new URLSearchParams(location.search);
  if (qp.get("season")==="off") return;

  // Respeta reduced motion
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Mapeo simple por mes (Hemisferio Norte)
  const m = (new Date()).getMonth(); // 0-11
  const season = (m<=1 || m===11) ? "winter"
                : (m>=2 && m<=4)  ? "spring"
                : (m>=5 && m<=7)  ? "summer"
                :                   "fall";

  // Crea canvas
  const c = document.createElement("canvas");
  c.className = "seasonal-canvas";
  document.body.appendChild(c);
  const ctx = c.getContext("2d", { alpha:true });

  let W=0,H=0, dpr=1;
  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = c.clientWidth; H = c.clientHeight;
    c.width = Math.floor(W * dpr);
    c.height= Math.floor(H * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener("resize", resize);

  // Ajusta densidad por dispositivo
  const base = Math.min(80, Math.max(30, Math.floor(W/18)));
  const COUNT = (season==="winter") ? base+10
              : (season==="spring") ? base
              : (season==="summer") ? Math.floor(base*0.8)
              :                        base+6;

  // Partículas
  const parts = [];
  function rand(a,b){ return a + Math.random()*(b-a); }

  // Paletas y formas
  const leafColors = ["#c58b41","#a86b2d","#8b5720","#7a4a1a","#d19a57"];
  const petalColors= ["#ffd1dc","#ffe4f0","#ffd8a8","#e6f7ff","#ffe8b3"];
  const sparkColors= ["#ffe7b0","#ffd27e","#fff0c9","#ffe0a1"];
  const snowColors = ["rgba(255,255,255,.95)","rgba(255,255,255,.8)","rgba(230,240,255,.9)"];

  function makeParticle(){
    const x = rand(0,W), y = rand(-H,0);
    const s = (season==="winter") ? rand(1,3.2)
            : (season==="spring") ? rand(1,2.5)
            : (season==="summer") ? rand(1,2.2)
            :                        rand(1.2,3.0);
    const vx = (season==="winter") ? rand(-0.3,0.6)
             : (season==="spring") ? rand(-0.2,0.5)
             : (season==="summer") ? rand(-0.15,0.35)
             :                       rand(-0.5,0.3);
    const vy = (season==="winter") ? rand(0.6,1.4)
             : (season==="spring") ? rand(0.5,1.2)
             : (season==="summer") ? rand(0.3,0.9)
             :                       rand(0.7,1.5);
    const rot = rand(0,Math.PI*2);
    const vr  = rand(-0.02,0.02);
    let color, type;
    if (season==="winter"){ color=snowColors[Math.floor(rand(0,snowColors.length))]; type="snow"; }
    else if (season==="spring"){ color=petalColors[Math.floor(rand(0,petalColors.length))]; type="petal"; }
    else if (season==="summer"){ color=sparkColors[Math.floor(rand(0,sparkColors.length))]; type="spark"; }
    else { color=leafColors[Math.floor(rand(0,leafColors.length))]; type="leaf"; }
    return {x,y,s,vx,vy,rot,vr,color,type,t:Math.random()*Math.PI*2};
  }

  for(let i=0;i<COUNT;i++) parts.push(makeParticle());

  function drawSnow(p){
    ctx.beginPath();
    ctx.fillStyle=p.color;
    ctx.arc(p.x,p.y,p.s,0,Math.PI*2);
    ctx.fill();
  }
  function drawPetal(p){
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.color;
    // pétalo tipo óvalo
    ctx.beginPath();
    ctx.ellipse(0,0,p.s*1.6,p.s*0.9,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  function drawSpark(p){
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.strokeStyle=p.color; ctx.lineWidth=1;
    ctx.beginPath();
    const r=p.s*2;
    ctx.moveTo(-r,0); ctx.lineTo(r,0);
    ctx.moveTo(0,-r); ctx.lineTo(0,r);
    ctx.stroke();
    ctx.restore();
  }
  function drawLeaf(p){
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle=p.color;
    // hojita en rombo suave
    ctx.beginPath();
    const w=p.s*2.2,h=p.s*3;
    ctx.moveTo(0,-h/2);
    ctx.quadraticCurveTo(w/2,0,0,h/2);
    ctx.quadraticCurveTo(-w/2,0,0,-h/2);
    ctx.fill();
    // nervio
    ctx.strokeStyle="rgba(0,0,0,.15)";
    ctx.lineWidth=.6;
    ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(0,h/2); ctx.stroke();
    ctx.restore();
  }

  let last=performance.now();
  function tick(now){
    const dt = Math.min(40, now - last)/16.666; // ~frames
    last = now;

    ctx.clearRect(0,0,W,H);

    for (let p of parts){
      // movimiento suave con mecido horizontal
      p.t += 0.01*dt;
      const wind = (season==="winter"||season==="fall") ? Math.sin(p.t)*0.2 : Math.sin(p.t)*0.1;
      p.x += (p.vx + wind)*dt;
      p.y += p.vy*dt;
      p.rot += p.vr*dt;

      // wrap
      if (p.y > H+20 || p.x < -20 || p.x > W+20){
        const np = makeParticle();
        p.x = np.x; p.y = -10; p.vx=np.vx; p.vy=np.vy; p.rot=np.rot; p.vr=np.vr; p.color=np.color; p.type=np.type; p.s=np.s; p.t=np.t;
      }

      if (p.type==="snow") drawSnow(p);
      else if (p.type==="petal") drawPetal(p);
      else if (p.type==="spark") drawSpark(p);
      else drawLeaf(p);
    }
    raf = requestAnimationFrame(tick);
  }
  let raf = requestAnimationFrame(tick);

  // Limpia si cambias de vista (SPA safety, por si acaso)
  window.addEventListener("beforeunload", ()=> cancelAnimationFrame(raf));
})();
</script>

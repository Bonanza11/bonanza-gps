/**
 * reschedule.js — Bonanza Transportation (Reschedule-only)
 * --------------------------------------------------------
 * Maneja la pantalla de reprogramación:
 *  - Lee el CN de la URL (?cn=...)
 *  - Carga detalles de la reserva existente (GET /api/book/get)
 *  - Enforce mínimo 24h para la nueva fecha/hora
 *  - Envía POST /api/book/reschedule { cn, newDate, newTime }
 *  - Muestra resultado y mensajes de error
 *
 * Este archivo NO depende de Maps ni Stripe.
 * Solo necesita existir reschedule.html y app.css.
 */

/* ===== Helpers mínimos ===== */
const byId = (id) => document.getElementById(id);

function earliestAllowedDt(){               // +24h, redondeado a 15'
  const d = new Date(Date.now() + 24*60*60*1000);
  const m = d.getMinutes();
  const add = 15 - (m % 15 || 15);
  d.setMinutes(m + add, 0, 0);
  return d;
}
function toLocalISODate(dt){
  const off = dt.getTimezoneOffset()*60000;
  return new Date(dt.getTime()-off).toISOString().slice(0,10);
}
function pad(n){ return String(n).padStart(2,'0'); }
function hhmm(dt){ return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; }
function onlyHHMM(v){ const m=String(v).match(/^(\d{2}:\d{2})/); return m?m[1]:v; }
function isAtLeast24hAhead(dateStr, timeStr){
  if(!dateStr || !timeStr) return false;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return (d.getTime() - Date.now()) >= 24*60*60*1000;
}
function getQueryCN(){
  const u = new URL(location.href);
  return (u.searchParams.get('cn') || '').trim();
}

/* ===== Pinta ayuda debajo de fecha/hora ===== */
function updateNewWhenHelp(){
  const d = byId('newDate')?.value || '';
  const t = byId('newTime')?.value || '';
  const help = byId('newWhenHelp');
  if (!help) return;
  if (!d || !t) { help.textContent = ''; return; }
  const ok = isAtLeast24hAhead(d,t);
  help.textContent = ok ? `Selected: ${d} ${t} (✓ min 24h)` : `Must be at least 24h in advance`;
  help.className = 'helper';
}

/* ===== Inicializa min 24h ===== */
function initMin24h(){
  const d = byId('newDate');
  const t = byId('newTime');
  if (!d || !t) return;

  const minDt = earliestAllowedDt();
  d.min = toLocalISODate(minDt);

  if (!d.value) d.value = toLocalISODate(minDt);
  if (!t.value) t.value = hhmm(minDt);

  d.addEventListener('change', updateNewWhenHelp);
  t.addEventListener('change', updateNewWhenHelp);
  updateNewWhenHelp();
}

/* ===== Cargar reserva por CN ===== */
async function loadByCN(cn){
  const out = byId('rescheduleOutput');
  if (!out) return;

  if (!cn){ out.textContent = 'Enter your reservation code (CN).'; return; }

  out.textContent = 'Looking up reservation...';
  try{
    const resp = await fetch(`/api/book/get?cn=${encodeURIComponent(cn)}`);
    const data = await resp.json();
    if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`);

    const b = data.booking;
    out.textContent =
      `CN ${b.confirmation_number} — status: ${b.status}
Current: ${b.date_iso} ${onlyHHMM(b.time_hhmm)} — Total: $${Number(b.quoted_total||0).toFixed(2)}`;

  }catch(e){
    out.textContent = '❌ Error: ' + (e?.message || e);
  }
}

/* ===== Submit reschedule ===== */
function wireSubmit(){
  const form = byId('rescheduleForm');
  const out  = byId('rescheduleOutput');
  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();

    const cn = (byId('cn')?.value || '').trim();
    const newDate = (byId('newDate')?.value || '').trim();
    const newTime = (byId('newTime')?.value || '').trim();

    if (!cn || !newDate || !newTime){
      alert('Complete CN, new date and new time.');
      return;
    }
    if (!isAtLeast24hAhead(newDate,newTime)){
      alert('Please choose a Date & Time at least 24 hours in advance.');
      return;
    }

    out.textContent = 'Submitting reschedule...';
    try{
      const resp = await fetch('/api/book/reschedule', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ cn, newDate, newTime })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`);

      const b = data.booking;
      out.textContent =
        `✅ Rescheduled to ${b.date_iso} ${onlyHHMM(b.time_hhmm)}.`;

    }catch(err){
      out.textContent = '❌ Error: ' + (err?.message || err);
    }
  });
}

/* ===== Botón Load ===== */
function wireLoadBtn(){
  const btn = byId('btnLoadCN');
  btn?.addEventListener('click', ()=>{
    const cn = (byId('cn')?.value || '').trim();
    if (!cn) { alert('Enter your reservation code'); return; }
    loadByCN(cn);
  });
}

/* ===== On Load ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  initMin24h();
  wireLoadBtn();
  wireSubmit();

  // Prefill con ?cn=...
  const qcn = getQueryCN();
  if (qcn){
    byId('cn').value = qcn;
    loadByCN(qcn);
  }
});

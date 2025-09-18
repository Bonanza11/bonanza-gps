/* ===========================================================
   Bonanza Transportation - HQ Admin v2 JS
   Archivo: public/admin_v2/js/main.js
   - Centraliza las llamadas API con x-admin-key
   - Maneja tabs, logout y recargas de datos
   =========================================================== */

const STORAGE_KEY = 'ADMIN_KEY'; // donde guardamos la clave de HQ
const $ = (q) => document.querySelector(q);

// ========== Helpers ==========
function getAdminKey() {
  let k = null;
  try { k = localStorage.getItem(STORAGE_KEY) || ''; } catch (_) {}
  if (!k) {
    k = prompt('Ingresa tu Admin Key (HQ):') || '';
    if (k) localStorage.setItem(STORAGE_KEY, k);
  }
  return k.trim();
}

async function api(path, opts = {}) {
  const key = getAdminKey();
  const headers = new Headers(opts.headers || {});
  headers.set('x-admin-key', key);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');

  const res = await fetch(path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    console.error(`[API ERROR] ${path}`, { status: res.status, data });
    throw new Error(msg);
  }
  return data;
}

function showToast(msg, ok = false) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.position = 'fixed';
    t.style.bottom = '16px';
    t.style.right = '16px';
    t.style.background = ok ? '#15803d' : '#991b1b';
    t.style.color = 'white';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '8px';
    t.style.fontSize = '14px';
    t.style.zIndex = '9999';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.display = 'none'), 3000);
}

// ========== UI inicial ==========
function setEnvBadge() {
  const el = $('#envBadge');
  if (!el) return;
  const host = location.hostname;
  if (host.includes('vercel.app')) {
    el.textContent = 'PROD';
  } else {
    el.textContent = 'LOCAL';
  }
}
setEnvBadge();

// Tabs
document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach((s) => s.classList.remove('active'));
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Logout
$('#btnLogout')?.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  showToast('Sesión cerrada', true);
  setTimeout(() => (location.href = '/admin_v2/login.html'), 600);
});

// ========== API Calls (ejemplos) ==========
async function fetchReservations() {
  const rows = await api('/api/reservations');
  const tbody = $('#tblReservations tbody');
  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.id}</td>
        <td>${new Date(r.pickup_time).toLocaleString()}</td>
        <td>${r.customer_name || ''}</td>
        <td>${r.pickup_location || ''} → ${r.dropoff_location || ''}</td>
        <td>${r.vehicle_label || ''}</td>
        <td>${r.status || ''}</td>
        <td>${r.driver_name || ''}</td>
        <td>${r.updated_at ? new Date(r.updated_at).toLocaleString() : ''}</td>
      </tr>`
    )
    .join('');
}

async function fetchVehicles() {
  const res = await api('/api/admin/vehicles');
  const vehicles = res.vehicles || res || [];
  const tbody = $('#tblVehicles tbody');
  tbody.innerHTML = vehicles
    .map(
      (v) => `
      <tr>
        <td>${v.id}</td>
        <td>${v.plate}</td>
        <td>${v.driver_name || ''}</td>
        <td>${v.kind}</td>
        <td>${v.year || ''}</td>
        <td>${v.model || ''}</td>
        <td>${v.active ? '✓' : '—'}</td>
      </tr>`
    )
    .join('');
}

async function fetchClients() {
  const res = await api('/api/admin/clients');
  const clients = res.clients || res || [];
  const tbody = $('#tblClients tbody');
  tbody.innerHTML = clients
    .map(
      (c) => `
      <tr>
        <td>${c.id}</td>
        <td>${c.name}</td>
        <td>${c.email}</td>
        <td>${c.phone}</td>
        <td>${c.internal_rating || ''}</td>
      </tr>`
    )
    .join('');
}

async function fetchDrivers() {
  const rows = await api('/api/drivers');
  const tbody = $('#tblDrivers tbody');
  tbody.innerHTML = rows
    .map(
      (d) => `
      <tr>
        <td>${d.id}</td>
        <td>${d.name}</td>
        <td>${d.email}</td>
        <td>${d.phone}</td>
        <td>${d.pay_mode || ''}</td>
        <td>${d.hourly_rate || d.per_ride_rate || d.revenue_share || ''}</td>
        <td>${d.notify_email ? 'email ' : ''}${d.notify_sms ? 'sms' : ''}</td>
      </tr>`
    )
    .join('');
}

// ========== Inicialización ==========
(async function boot() {
  try {
    await Promise.all([fetchReservations(), fetchVehicles(), fetchClients(), fetchDrivers()]);
    showToast('Datos cargados', true);
  } catch (e) {
    alert('Error cargando datos. Verifica tu Admin Key o la API.\n' + e.message);
  }
})();

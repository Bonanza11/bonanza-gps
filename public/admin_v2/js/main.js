/* ===========================================================
   Bonanza Transportation - HQ Admin v2 JS
   Archivo: public/admin_v2/js/main.js
   - Auth: JWT (Authorization) y/o x-admin-key
   - Health check, tabs, acciones CRUD básicas
   - Manejo robusto de errores y reintentos
   =========================================================== */

const STORAGE_ADMIN_KEY = 'ADMIN_KEY';       // admin key HQ (x-admin-key)
const STORAGE_JWT       = 'HQ_JWT';          // token de /api/login (Authorization)
const API_BASE          = '';                // mismo host (Vercel)

const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];

/* =============== Auth helpers =============== */
function getAdminKey() {
  try { return (localStorage.getItem(STORAGE_ADMIN_KEY) || '').trim(); } catch { return ''; }
}
function setAdminKey(v) {
  try { localStorage.setItem(STORAGE_ADMIN_KEY, v || ''); } catch {}
}
function getJWT() {
  try { return (localStorage.getItem(STORAGE_JWT) || '').trim(); } catch { return ''; }
}
function setJWT(v) {
  try { localStorage.setItem(STORAGE_JWT, v || ''); } catch {}
}

/* =============== Toast/UX =============== */
function showToast(msg, ok = false) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    Object.assign(t.style, {
      position: 'fixed', bottom: '16px', right: '16px',
      background: '#111827', color: 'white',
      border: '1px solid #1f2937', borderRadius: '10px',
      padding: '10px 14px', boxShadow: '0 10px 30px rgba(0,0,0,.35)',
      zIndex: 9999, maxWidth: '420px', fontSize: '14px'
    });
    document.body.appendChild(t);
  }
  t.style.background = ok ? '#166534' : '#7f1d1d';
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.opacity = '0'), 2500);
}

function setEnvBadge() {
  const el = $('#envBadge');
  if (!el) return;
  const host = location.hostname;
  el.textContent = host.includes('vercel.app') ? 'PROD' : 'LOCAL';
}
setEnvBadge();

/* =============== Fetch wrapper =============== */
async function api(path, { method = 'GET', headers = {}, body, raw = false, retryOnAuth = true } = {}) {
  const h = new Headers(headers);

  // Auth headers
  const jwt = getJWT();
  const key = getAdminKey();
  if (jwt) h.set('Authorization', `Bearer ${jwt}`);
  if (key)  h.set('x-admin-key', key);

  if (!h.has('Content-Type') && body && !(body instanceof FormData)) {
    h.set('Content-Type', 'application/json');
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers: h,
    body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
  });

  // 401/403 -> intentar pedir admin key y reintentar una vez
  if (retryOnAuth && (res.status === 401 || res.status === 403)) {
    // pedir clave si no hay o está mal
    const current = getAdminKey();
    const entered = prompt('Admin Key requerida para HQ:', current || '');
    if (entered != null) setAdminKey(entered.trim());
    if (entered?.trim() !== current) {
      return api(path, { method, headers, body, raw, retryOnAuth: false });
    }
  }

  if (raw) return res;

  // parseo seguro JSON
  let data = null;
  try { data = await res.json(); } catch { /* puede no tener cuerpo */ }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    const detail = data?.detail ? ` – ${data.detail}` : '';
    throw new Error(`${msg}${detail}`);
  }
  return data;
}

// Por conveniencia cuando siempre esperamos JSON
const apiJSON = (path, opts) => api(path, opts);

/* =============== Acciones específicas =============== */
// RESERVAS
async function fetchReservations() {
  const tbody = $('#tblReservations tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="muted" style="padding:16px">Cargando…</td></tr>`;
  const rows = await apiJSON('/api/reservations');
  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="padding:16px">Sin datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.pickup_time ? new Date(r.pickup_time).toLocaleString() : ''}</td>
      <td>${r.customer_name || ''}</td>
      <td>${r.pickup_location || ''} → ${r.dropoff_location || ''}</td>
      <td>${r.vehicle_label || ''}</td>
      <td>${r.status || ''}</td>
      <td>${r.driver_name || ''}</td>
      <td>${r.updated_at ? new Date(r.updated_at).toLocaleString() : ''}</td>
    </tr>
  `).join('');
}

async function assignOrUnassignReservation() {
  const id = ($('#resId')?.value || '').trim();
  let driver = ($('#resDriverId')?.value || '').trim();

  if (!id) { showToast('Falta ID de reserva', false); return; }

  // driver vacío => desasignar
  if (driver === '') driver = null;

  const upd = await apiJSON('/api/reservations', {
    method: 'PATCH',
    body: { id: Number(id), driver_id: driver || null }
  });
  showToast(`Reserva ${upd.id} => ${upd.status}`, true);
  fetchReservations().catch(()=>{});
}

// VEHÍCULOS
async function fetchVehicles() {
  const tbody = $('#tblVehicles tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="muted" style="padding:16px">Cargando…</td></tr>`;
  const res = await apiJSON('/api/admin/vehicles');
  const vehicles = res?.vehicles || res || [];
  if (!vehicles.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="padding:16px">Sin datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = vehicles.map(v => `
    <tr>
      <td>${v.id}</td>
      <td>${v.plate}</td>
      <td>${v.driver_name || ''}</td>
      <td>${v.kind}</td>
      <td>${v.year || ''}</td>
      <td>${v.model || ''}</td>
      <td>${v.active ? '✓' : '—'}</td>
      <td></td>
    </tr>
  `).join('');
}

async function upsertVehicle() {
  const plate  = ($('#vPlate')?.value || '').trim();
  const driver = ($('#vDriver')?.value || '').trim();
  const kind   = ($('#vKind')?.value  || 'SUV').trim();
  const year   = parseInt($('#vYear')?.value || '', 10) || null;
  const model  = ($('#vModel')?.value || '').trim() || null;

  if (!plate) { showToast('Falta placa', false); return; }

  const body = {
    plate,
    driver_name: driver || '',
    kind: kind.toUpperCase() === 'VAN' ? 'VAN' : 'SUV',
    year,
    model
  };

  const res = await apiJSON('/api/admin/vehicles', { method: 'POST', body });
  showToast(`Vehículo ${res.vehicle?.plate || plate} actualizado`, true);
  fetchVehicles().catch(()=>{});
}

// CLIENTES
async function fetchClients() {
  const tbody = $('#tblClients tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:16px">Cargando…</td></tr>`;
  const res = await apiJSON('/api/admin/clients');
  const clients = res?.clients || res || [];
  if (!clients.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:16px">Sin datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = clients.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.email || ''}</td>
      <td>${c.phone || ''}</td>
      <td>${c.internal_rating || ''}</td>
      <td></td>
    </tr>
  `).join('');
}

async function upsertClient() {
  const name  = ($('#cName')?.value  || '').trim();
  const email = ($('#cEmail')?.value || '').trim();
  const phone = ($('#cPhone')?.value || '').trim();
  if (!name) { showToast('Falta nombre', false); return; }

  const res = await apiJSON('/api/admin/clients', {
    method: 'POST',
    body: { name, email: email || null, phone: phone || null }
  });
  showToast(`Cliente ${res.client?.name || name} guardado`, true);
  fetchClients().catch(()=>{});
}

// DRIVERS
async function fetchDrivers() {
  const tbody = $('#tblDrivers tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="muted" style="padding:16px">Cargando…</td></tr>`;
  const rows = await apiJSON('/api/drivers');
  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="padding:16px">Sin datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(d => `
    <tr>
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.email || ''}</td>
      <td>${d.phone || ''}</td>
      <td>${d.pay_mode || ''}</td>
      <td>${d.hourly_rate ?? d.per_ride_rate ?? d.revenue_share ?? ''}</td>
      <td>${d.notify_email ? 'email ' : ''}${d.notify_sms ? 'sms' : ''}</td>
    </tr>
  `).join('');
}

async function createDriver() {
  const name  = ($('#dName')?.value  || '').trim();
  const email = ($('#dEmail')?.value || '').trim();
  const phone = ($('#dPhone')?.value || '').trim();
  if (!name) { showToast('Falta nombre', false); return; }

  const row = await apiJSON('/api/drivers', {
    method: 'POST',
    body: { name, email: email || null, phone: phone || null }
  });
  showToast(`Driver ${row?.name || name} creado`, true);
  fetchDrivers().catch(()=>{});
}

/* =============== Tabs & eventos UI =============== */
$$('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab').forEach(s => s.classList.remove('active'));
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

$('#btnLogout')?.addEventListener('click', () => {
  setJWT('');
  setAdminKey('');
  showToast('Sesión cerrada', true);
  setTimeout(() => { location.href = '/admin_v2/login.html'; }, 500);
});

$('#btnRefetchReservations')?.addEventListener('click', () => fetchReservations().catch(e=>showToast(e.message)));
$('#btnAssign')?.addEventListener('click', () => assignOrUnassignReservation().catch(e=>showToast(e.message)));

$('#btnRefetchVehicles')?.addEventListener('click', () => fetchVehicles().catch(e=>showToast(e.message)));
$('#btnVehicleUpsert')?.addEventListener('click', () => upsertVehicle().catch(e=>showToast(e.message)));

$('#btnRefetchClients')?.addEventListener('click', () => fetchClients().catch(e=>showToast(e.message)));
$('#btnClientUpsert')?.addEventListener('click', () => upsertClient().catch(e=>showToast(e.message)));

$('#btnRefetchDrivers')?.addEventListener('click', () => fetchDrivers().catch(e=>showToast(e.message)));
$('#btnDriverCreate')?.addEventListener('click', () => createDriver().catch(e=>showToast(e.message)));

/* =============== Health-check + boot =============== */
async function healthCheck() {
  const k = getAdminKey();
  if (!k) return; // puede operar solo con JWT si ya existe
  // /api/ping usa querystring ?key=…
  const res = await api('/api/ping?key=' + encodeURIComponent(k), { raw: true, retryOnAuth: false });
  if (!res.ok) throw new Error('ping_failed');
}

(async function boot() {
  try {
    // no bloqueante: si falla ping mostramos aviso pero continuamos
    healthCheck().catch(() => showToast('Atención: ping a API falló. Verifica ADMIN_KEY/JWT.', false));

    await Promise.all([
      fetchReservations(),
      fetchVehicles(),
      fetchClients(),
      fetchDrivers()
    ]);
    showToast('Datos cargados', true);
  } catch (e) {
    alert('Error cargando datos. Verifica tu Admin Key, JWT o la API.\n' + e.message);
  }
})();

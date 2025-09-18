/* ===== Helpers ===== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const adminKey = localStorage.getItem('adminKey') || '';
if (!adminKey) location.href = './login.html';

function hdr() {
  return { 'Content-Type':'application/json', 'x-admin-key': adminKey };
}
async function apiGet(url) {
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiSend(url, method, body) {
  const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString();
}

/* ===== Tabs ===== */
const tabBtns = $$('.tabs button');
const tabs = {
  reservations: $('#tab-reservations'),
  vehicles:     $('#tab-vehicles'),
  clients:      $('#tab-clients'),
  drivers:      $('#tab-drivers'),
};
tabBtns.forEach(b => b.addEventListener('click', () => {
  tabBtns.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  Object.values(tabs).forEach(el => el.classList.remove('active'));
  tabs[b.dataset.tab].classList.add('active');
}));

/* ===== Top actions ===== */
$('#btnLogout').addEventListener('click', () => {
  localStorage.removeItem('adminKey');
  location.href = './login.html';
});

/* ===== RESERVATIONS ===== */
const tblRes = $('#tblReservations tbody');

async function loadReservations() {
  tblRes.innerHTML = '<tr><td colspan="8">Cargando…</td></tr>';
  const rows = await apiGet('/api/reservations'); // ← devuelve array
  tblRes.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${fmtDateTime(r.pickup_time)}</td>
      <td>${r.customer_name || ''}<br><span class="muted">${r.email||''} ${r.phone? ' · '+r.phone:''}</span></td>
      <td>${r.pickup_location} → ${r.dropoff_location}</td>
      <td>${r.vehicle_label || ''}</td>
      <td>${r.status}</td>
      <td>${r.driver_name || ''}</td>
      <td>${fmtDateTime(r.updated_at)}</td>
    `;
    tblRes.appendChild(tr);
  }
}
$('#btnRefetchReservations').addEventListener('click', loadReservations);

$('#btnAssign').addEventListener('click', async () => {
  const id = Number($('#resId').value);
  const driverId = ($('#resDriverId').value || '').trim() || null; // null => desasignar
  if (!id) return alert('ID requerido');
  const res = await apiSend('/api/reservations', 'PATCH', { id, driver_id: driverId });
  alert(`Reserva ${res.id} → ${res.status}`);
  loadReservations();
});

/* ===== VEHICLES ===== */
const tblVeh = $('#tblVehicles tbody');

async function loadVehicles() {
  tblVeh.innerHTML = '<tr><td colspan="8">Cargando…</td></tr>';
  const js = await apiGet('/api/admin/vehicles');
  const rows = js.vehicles || [];
  tblVeh.innerHTML = '';
  for (const v of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.id}</td>
      <td>${v.plate}</td>
      <td>${v.driver_name || ''}</td>
      <td>${v.kind}</td>
      <td>${v.year || ''}</td>
      <td>${v.model || ''}</td>
      <td>${v.active ? '✅' : '—'}</td>
      <td>
        <button class="secondary" data-act="toggle" data-id="${v.id}" data-active="${v.active ? 0 : 1}">
          ${v.active ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    `;
    tblVeh.appendChild(tr);
  }
}
tblVeh.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-act="toggle"]');
  if (!b) return;
  const id = b.dataset.id;
  const active = b.dataset.active === '1';
  const js = await apiSend('/api/admin/vehicles', 'POST', { id, active });
  alert(`Vehículo ${js.vehicle.plate} → ${js.vehicle.active ? 'Activo' : 'Inactivo'}`);
  loadVehicles();
});
$('#btnRefetchVehicles').addEventListener('click', loadVehicles);

$('#btnVehicleUpsert').addEventListener('click', async () => {
  const body = {
    plate: $('#vPlate').value.trim(),
    driver_name: $('#vDriver').value.trim(),
    kind: $('#vKind').value.trim(),
    year: Number($('#vYear').value) || null,
    model: $('#vModel').value.trim() || null,
  };
  if (!body.plate || !body.driver_name || !body.year) return alert('Placa, Driver y Año son requeridos.');
  const js = await apiSend('/api/admin/vehicles', 'POST', body);
  alert(`OK: ${js.vehicle.plate}`);
  loadVehicles();
});

/* ===== CLIENTS ===== */
const tblCli = $('#tblClients tbody');

async function loadClients() {
  tblCli.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';
  const js = await apiGet('/api/admin/clients');
  const rows = js.clients || [];
  tblCli.innerHTML = '';
  for (const c of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.email || ''}</td>
      <td>${c.phone || ''}</td>
      <td>${c.internal_rating || ''}</td>
      <td><button class="danger" data-del="${c.id}">Eliminar</button></td>
    `;
    tblCli.appendChild(tr);
  }
}
$('#btnRefetchClients').addEventListener('click', loadClients);
tblCli.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-del]');
  if (!b) return;
  if (!confirm('¿Eliminar cliente?')) return;
  const id = b.dataset.del;
  const r = await fetch(`/api/admin/clients?id=${encodeURIComponent(id)}`, {
    method:'DELETE', headers: hdr()
  });
  if (!r.ok) return alert('Error eliminando');
  loadClients();
});

$('#btnClientUpsert').addEventListener('click', async () => {
  const body = {
    name: $('#cName').value.trim(),
    email: $('#cEmail').value.trim(),
    phone: $('#cPhone').value.trim()
  };
  if (!body.name) return alert('Nombre es requerido');
  const js = await apiSend('/api/admin/clients', 'POST', body);
  alert(`OK: ${js.client?.name || 'creado'}`);
  loadClients();
});

/* ===== DRIVERS ===== */
const tblDrv = $('#tblDrivers tbody');

async function loadDrivers() {
  tblDrv.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';
  const rows = await apiGet('/api/drivers'); // GET devuelve array
  tblDrv.innerHTML = '';
  for (const d of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.email || ''}</td>
      <td>${d.phone || ''}</td>
      <td>${d.pay_mode}</td>
      <td>${[d.hourly_rate, d.per_ride_rate, d.revenue_share].map(x => x ?? '—').join(' / ')}</td>
      <td>${d.notify_email ? '📧' : ''} ${d.notify_sms ? '📱' : ''}</td>
    `;
    tblDrv.appendChild(tr);
  }
}
$('#btnRefetchDrivers').addEventListener('click', loadDrivers);

$('#btnDriverCreate').addEventListener('click', async () => {
  const body = {
    name: $('#dName').value.trim(),
    email: $('#dEmail').value.trim() || null,
    phone: $('#dPhone').value.trim() || null
  };
  if (!body.name) return alert('Nombre requerido');
  const js = await apiSend('/api/drivers', 'POST', body);
  alert(`Driver creado: ${js?.name || '(sin nombre?)'}`);
  loadDrivers();
});

/* ===== Boot ===== */
(async function boot() {
  try {
    await loadReservations();
    await loadVehicles();
    await loadClients();
    await loadDrivers();
  } catch (e) {
    alert('Error cargando datos. Verifica tu Admin Key o la API.');
    console.error(e);
  }
})();

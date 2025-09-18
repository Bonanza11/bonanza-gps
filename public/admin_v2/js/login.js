// Lee/guarda clave en localStorage y valida con /api/ping?key=...

const $ = (sel) => document.querySelector(sel);
const adminKeyInput = $('#adminKey');
const form = $('#loginForm');
const btn = $('#submitBtn');
const msg = $('#msg');
const toggle = $('#togglePw');

// Si ya había una key guardada, la mostramos para comodidad
const saved = localStorage.getItem('adminKey');
if (saved) adminKeyInput.value = saved;

toggle?.addEventListener('change', () => {
  adminKeyInput.type = toggle.checked ? 'text' : 'password';
  adminKeyInput.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = adminKeyInput.value.trim();
  if (!key) return;

  msg.textContent = 'Verificando clave...';
  msg.className = 'msg';
  btn.disabled = true;

  try {
    // Valida con tu endpoint de salud que revisa ADMIN_KEY
    const url = `/api/ping?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    let ok = false;

    if (res.ok) {
      // /api/ping devuelve { ok: true, db: true } si pasa
      const data = await res.json().catch(() => ({}));
      ok = !!data?.ok;
    }

    if (ok) {
      localStorage.setItem('adminKey', key);
      msg.textContent = 'Acceso concedido. Entrando...';
      msg.className = 'msg ok';
      // Redirige al panel principal
      window.location.href = '/admin_v2/index.html';
    } else {
      throw new Error('Clave inválida');
    }
  } catch (err) {
    msg.textContent = 'Clave inválida o servidor no disponible.';
    msg.className = 'msg error';
  } finally {
    btn.disabled = false;
  }
});

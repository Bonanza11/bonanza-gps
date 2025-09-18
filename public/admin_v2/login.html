/* ===========================================================
   Bonanza Transportation - HQ Login JS
   Archivo: public/admin_v2/js/login.js
   - Valida conectividad / clave de admin contra /api/ping
   - Guarda token/clave local y redirige a /admin_v2/index.html
   =========================================================== */

(function () {
  const $ = (q) => document.querySelector(q);
  const form = $('#hqLoginForm');
  const msg  = $('#hqMsg');
  const pass = $('#hqPass');
  const remember = $('#hqRemember');
  const toggleBtn = $('#togglePass');

  // Prefill desde localStorage (si lo quisieras)
  try {
    const savedUser = localStorage.getItem('HQ_USER') || '';
    if (savedUser) $('#hqUser').value = savedUser;

    const savedRemember = localStorage.getItem('HQ_REMEMBER') === '1';
    remember.checked = savedRemember;
  } catch (_) {}

  // Mostrar/Ocultar password
  toggleBtn?.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? 'hide' : 'show';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    // En esta versión el formulario es “cosmético”; la autorización real
    // se hace con la ADMIN_KEY (guardada de una sesión anterior o pedida luego).
    // Si quieres validar user/pass de verdad, aquí llamarías a /api/auth/login.
    const username = $('#hqUser').value.trim();
    const password = $('#hqPass').value; // no se usa aún

    // Persistir preferencia de "remember me"
    try {
      localStorage.setItem('HQ_USER', username);
      localStorage.setItem('HQ_REMEMBER', remember.checked ? '1' : '0');
    } catch (_) {}

    // 1) Obtener/confirmar ADMIN_KEY
    let key = null;
    try { key = localStorage.getItem('ADMIN_KEY') || ''; } catch (_) {}

    if (!key) {
      key = prompt('Enter Admin Key (x-admin-key):') || '';
    }
    if (!key) {
      msg.textContent = 'Missing Admin Key.';
      return;
    }

    // 2) Verificar contra /api/ping
    try {
      const url = `/api/ping?key=${encodeURIComponent(key)}`;
      const r = await fetch(url);
      // Si el endpoint devuelve JSON {ok:true, db:true}
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        msg.textContent = 'Invalid Admin Key or API error.';
        return;
      }
    } catch (err) {
      console.error(err);
      msg.textContent = 'server_error';
      return;
    }

    // 3) Guardar y redirigir al panel
    try { localStorage.setItem('ADMIN_KEY', key); } catch (_) {}
    location.href = '/admin_v2/index.html';
  });
})();

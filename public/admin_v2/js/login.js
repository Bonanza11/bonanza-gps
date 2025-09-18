(() => {
  const $ = (sel) => document.querySelector(sel);
  const adminKeyInput = $('#adminKey');
  const msg = $('#msg');

  $('#btnLogin').addEventListener('click', async () => {
    const key = adminKeyInput.value.trim();
    if (!key) {
      msg.style.display = 'block';
      msg.textContent = 'Ingresa una clave';
      return;
    }
    // Guardamos y probamos con /api/ping?key=
    try {
      const r = await fetch(`/api/ping?key=${encodeURIComponent(key)}`);
      if (!r.ok) throw new Error('Clave inválida');
      const js = await r.json();
      if (!js.ok) throw new Error('Clave inválida');
      localStorage.setItem('adminKey', key);
      location.href = './index.html';
    } catch (e) {
      msg.style.display = 'block';
      msg.textContent = 'Clave inválida o API caída';
    }
  });

  // Enter para enviar
  adminKeyInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') $('#btnLogin').click();
  });
})();

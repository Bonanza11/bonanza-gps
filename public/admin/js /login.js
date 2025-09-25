


// ===========================================================
// Bonanza Transportation - HQ Login Logic
// Archivo: public/admin/js/login.js
// ===========================================================

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const say = (t) => { $("#hqMsg").textContent = t || ""; };
  const LS_TOKEN = "bonanza_jwt";
  const LS_USER  = "bonanza_user";
  const LS_REM   = "bonanza_remember";

  // Marca de entorno (solo UI)
  try {
    const pill = $("#envPill");
    const host = location.host;
    pill.textContent = /localhost|127\.0\.0\.1/.test(host) ? "local" :
                       /\.vercel\.app$/.test(host) ? "prod" : host;
  } catch {}

  // Prefill remember me
  try {
    const remembered = localStorage.getItem(LS_REM);
    if (remembered) {
      const u = localStorage.getItem(LS_USER) || "";
      $("#hqUser").value = u;
      $("#hqRemember").checked = true;
    }
  } catch {}

  // Show / hide password
  $("#togglePass").addEventListener("click", () => {
    const i = $("#hqPass");
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    $("#togglePass").textContent = show ? "hide" : "show";
    $("#togglePass").setAttribute("aria-pressed", String(show));
  });

  // Si ya hay JWT válido, opcional: redirige directo al panel
  (async () => {
    const t = localStorage.getItem(LS_TOKEN);
    if (!t) return;
    // Ping rápido contra un endpoint protegido (reservations GET)
    try {
      const r = await fetch("/api/reservations", {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (r.ok) {
        // token sirve → al panel
        location.href = "/admin_v2/index.html";
      }
    } catch {}
  })();

  // Submit
  $("#hqLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    say("");
    const btn = $("#btnSign");
    btn.disabled = true;

    const username = $("#hqUser").value.trim();
    const password = $("#hqPass").value;

    // UX: recordar usuario si se marca
    try {
      if ($("#hqRemember").checked) {
        localStorage.setItem(LS_REM, "1");
        localStorage.setItem(LS_USER, username);
      } else {
        localStorage.removeItem(LS_REM);
        localStorage.removeItem(LS_USER);
      }
    } catch {}

    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.token) {
        const msg = data?.error || "Invalid credentials";
        say(msg);
        btn.disabled = false;
        return;
      }

      // Guardar JWT y pasar al panel
      localStorage.setItem(LS_TOKEN, data.token);
      // (opcional) guarda roles o user id si lo devuelves
      if (data.user?.username) localStorage.setItem(LS_USER, data.user.username);

      location.href = "/admin_v2/index.html";
    } catch (err) {
      console.error("[login] error", err);
      say("server_error");
      btn.disabled = false;
    }
  });
})();

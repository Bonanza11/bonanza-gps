// /app/scripts/maps-loader.js
(() => {
  const SCRIPT_ID = "gmaps-loader";
  let _promise = null;

  function buildSrc(key, params = {}) {
    const q = new URLSearchParams();
    q.set("key", key);
    q.set("v", params.v || "weekly");
    if (params.libraries) q.set("libraries", params.libraries);
    if (params.language) q.set("language", params.language);
    if (params.region) q.set("region", params.region);

    // Usamos callback explícito para saber con certeza cuándo está listo
    const cb = "__gmaps_cb_" + Math.random().toString(36).slice(2);
    q.set("callback", cb);
    return { src: `https://maps.googleapis.com/maps/api/js?${q.toString()}`, cb };
  }

  function injectScript(src, cbName) {
    return new Promise((resolve, reject) => {
      // callback global que invoca Google cuando termina de inicializar
      window[cbName] = () => {
        try { delete window[cbName]; } catch {}
        resolve(window.google.maps);
      };

      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onerror = (e) => {
        try { delete window[cbName]; } catch {}
        reject(new Error("Google Maps failed to load"));
      };

      // Timeout duro por si el callback nunca ocurre (red lenta, adblock, etc.)
      const t = setTimeout(() => {
        try { delete window[cbName]; } catch {}
        reject(new Error("Google Maps load timeout"));
      }, 15000);

      // Si el callback se dispara, limpiamos el timeout en resolve (arriba)
      const _resolve = resolve;
      resolve = (v) => { clearTimeout(t); _resolve(v); };

      document.head.appendChild(s);
    });
  }

  function waitForExisting() {
    // Si ya existe el script, espera a que window.google.maps esté listo
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function check() {
        if (window.google && window.google.maps) return resolve(window.google.maps);
        if (Date.now() - started > 15000) return reject(new Error("Google Maps readiness timeout"));
        setTimeout(check, 80);
      })();
    });
  }

  function loadGoogleMaps(key, params = {}) {
    if (window.google && window.google.maps) {
      // Ya cargado
      return Promise.resolve(window.google.maps);
    }
    if (_promise) return _promise;

    if (!key || typeof key !== "string" || key.trim() === "") {
      return Promise.reject(new Error("Missing Google Maps API key"));
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      _promise = waitForExisting();
      return _promise;
    }

    const { src, cb } = buildSrc(key, params);
    _promise = injectScript(src, cb);
    return _promise;
  }

  window.loadGoogleMaps = loadGoogleMaps;
})();

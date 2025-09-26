// /app/scripts/maps-loader.js
(() => {
  const GLOBAL_ID = "gmaps-loader";
  let _promise = null;

  function inject(key, params = {}) {
    if (!key) return Promise.reject(new Error("Missing Google Maps API key"));
    const q = new URLSearchParams({
      key,
      v: "weekly",
      libraries: params.libraries || "places,marker",
      language: params.language || "en",
      region: params.region || "US",
    });
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.id = GLOBAL_ID;
      s.src = `https://maps.googleapis.com/maps/api/js?${q.toString()}`;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
  }

  async function loadGoogleMaps(key, params = {}) {
    if (window.google?.maps) return; // ya cargado
    if (!_promise) {
      const existing = document.getElementById(GLOBAL_ID);
      _promise = existing
        ? new Promise((resolve) => {
            const check = () =>
              window.google?.maps ? resolve() : setTimeout(check, 60);
            check();
          })
        : inject(key, params);
    }
    await _promise;
  }

  window.loadGoogleMaps = loadGoogleMaps;
})();

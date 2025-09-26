// /app/scripts/maps-loader.js
(function () {
  const GLOBAL_ID = "gmaps-loader";
  let _promise = null;

  function _inject(key, params = {}) {
    const q = new URLSearchParams({
      key,
      libraries: params.libraries || "places",
    });
    const s = document.createElement("script");
    s.id = GLOBAL_ID;
    s.src = `https://maps.googleapis.com/maps/api/js?${q.toString()}`;
    s.async = true;
    s.defer = true;
    return new Promise((resolve, reject) => {
      s.onload = resolve;
      s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
  }

  async function loadGoogleMaps(key, params = {}) {
    if (window.google && window.google.maps) return;
    if (!_promise) {
      const existing = document.getElementById(GLOBAL_ID);
      _promise = existing
        ? new Promise((resolve) => {
            const check = () =>
              window.google && window.google.maps ? resolve() : setTimeout(check, 80);
            check();
          })
        : _inject(key, params);
    }
    await _promise;
  }

  // 👇 CLAVE: exponer en window
  window.loadGoogleMaps = loadGoogleMaps;
})();

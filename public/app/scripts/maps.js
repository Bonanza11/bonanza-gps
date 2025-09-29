/*
maps.js — Bonanza Transportation (Google Maps + Places + Rutas)
──────────────────────────────────────────────────────────────
- Mapa usa MAP_ID de window.__PUBLIC_CFG__.
- Autocomplete para pickup/dropoff.
- 🚗 Al elegir ambas direcciones: DIBUJA LA RUTA (línea negra) pero NO muestra el Trip Summary.
- 🧮 Al presionar "Calculate Price": calcula recargo y llama BNZ.renderQuote() para mostrar el summary.
*/
(function () {
  "use strict";

  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // SLC
  const BASE_ADDRESS   = "13742 N Jordanelle Pkwy, Kamas, UT 84036";

  const MAP_ID = (window.__PUBLIC_CFG__ && window.__PUBLIC_CFG__.MAP_ID)
    ? window.__PUBLIC_CFG__.MAP_ID
    : "1803eda89e913c8354156119";

  let map, dirService, dirRenderer;
  let originText = "", destinationText = "";
  let lastLeg = null;   // cache de la última pierna (para usar al calcular)
  let lastRoute = null; // cache del DirectionsResult (opcional)

  window.pickupPlace  = window.pickupPlace  || null;
  window.dropoffPlace = window.dropoffPlace || null;

  // Alias disponibles para booking.js
  window.BNZ_AIRPORTS = window.BNZ_AIRPORTS || {
    slcNames: [
      "salt lake city international airport",
      "slc airport",
      "slc intl",
      "slc int’l",
      "salt lake city airport",
      "w terminal dr, salt lake city",
      "slc terminal"
    ],
    jsxNames: [
      "jsx",
      "jsx slc",
      "jsx terminal",
      "jsx salt lake",
      "signature flight support jsx"
    ]
  };

  // ───────── helpers comunes
  function isAirport(place) {
    const t = place?.types || [];
    const txt = `${place?.name || ""} ${place?.formatted_address || ""}`.toLowerCase();
    return t.includes("airport") || /airport/.test(txt);
  }
  function isUtah(place) {
    const addr = (place?.formatted_address || "").toLowerCase();
    return /\but\b/.test(addr) || /, ut(ah)?\b/.test(addr);
  }
  function isPrivateUtahAirport(place) {
    if (!place || !isAirport(place) || !isUtah(place)) return false;
    const text = `${place.name || ""} ${place.formatted_address || ""}`;
    const FBO_RX = /\b(fbo|jet center|private terminal|general aviation|hangar|atlantic aviation|million air|signature|ross aviation|tac air|ok3 air|lynx|modern aviation|provo jet center)\b/i;
    return FBO_RX.test(text);
  }
  function isSLCInternational(place) {
    if (!place) return false;
    const name = (place.name || "").toLowerCase();
    const addr = (place.formatted_address || "").toLowerCase();
    const hit  =
      /salt lake city international/.test(name) ||
      /salt lake city international/.test(addr) ||
      /\bslc\b/.test(name) || /\bslc\b/.test(addr);
    return hit && isAirport(place) && !isPrivateUtahAirport(place);
  }
  function countyFrom(place) {
    const comps = place?.address_components || [];
    const c = comps.find((x) => x.types?.includes("administrative_area_level_2"));
    return c?.long_name || "";
  }
  function geocodeAsync(req) {
    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(req, (results, status) => {
        if (status === "OK" && results?.[0]) resolve(results[0]);
        else reject(status || "GEOCODE_ERROR");
      });
    });
  }
  function routeAsync(opts) {
    return new Promise((resolve, reject) => {
      dirService.route(opts, (r, s) => (s === "OK" && r ? resolve(r) : reject(s || "ROUTE_ERROR")));
    });
  }
  async function countyByPlaceId(placeId) {
    try {
      const r = await geocodeAsync({ placeId });
      const c = r.address_components.find((x) => x.types?.includes("administrative_area_level_2"));
      return c?.long_name || "";
    } catch { return ""; }
  }
  async function milesFromBaseTo(placeId) {
    const r = await routeAsync({
      origin: BASE_ADDRESS,
      destination: { placeId },
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    });
    const leg = r.routes[0].legs[0];
    return leg.distance.value / 1609.34;
  }

  // ───────── recargo $3/mi
  async function computeSurchargeAsync() {
    if (!window.pickupPlace && !window.dropoffPlace) return 0;

    const ALLOWED_RX = /Summit County|Wasatch County/;
    const pickup = window.pickupPlace;
    const drop   = window.dropoffPlace;

    const pickupCounty = pickup
      ? (countyFrom(pickup) || (pickup.place_id ? await countyByPlaceId(pickup.place_id) : ""))
      : "";
    const dropCounty = drop
      ? (countyFrom(drop) || (drop.place_id ? await countyByPlaceId(drop.place_id) : ""))
      : "";

    const pickupIsAir = !!pickup && isAirport(pickup);

    if (pickupIsAir) {
      const dropAllowed = ALLOWED_RX.test(dropCounty);
      if (!dropAllowed && pickup?.place_id) {
        const miles = await milesFromBaseTo(pickup.place_id);
        return Math.round(miles * 3 * 100) / 100;
      }
      return 0;
    }

    const pickupAllowed = ALLOWED_RX.test(pickupCounty);
    if (!pickupAllowed && pickup?.place_id) {
      const miles = await milesFromBaseTo(pickup.place_id);
      return Math.round(miles * 3 * 100) / 100;
    }
    return 0;
  }

  // ───────── Autocomplete
  function attachAutocomplete(inputId, opts = {}) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.setAttribute("autocomplete", "off");

    if (!google.maps.places || !google.maps.places.Autocomplete) {
      console.error("[maps] Places library not loaded");
      return;
    }

    const ac = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: ["us"] },
      fields: ["place_id","geometry","name","formatted_address","address_components","types"],
      ...opts,
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const loc = place?.geometry?.location;
      if (loc && map) { map.panTo(loc); map.setZoom(12); }

      const pretty = (place?.formatted_address || place?.name || input.value || "").trim();

      if (inputId === "pickup") {
        originText = pretty;
        window.pickupPlace = place || null;
        if (window.BNZ?.onPickupPlaceChanged) BNZ.onPickupPlaceChanged(place);
        if (window.updateMeetGreetVisibility) window.updateMeetGreetVisibility();
      } else {
        destinationText = pretty;
        window.dropoffPlace = place || null;
      }

      // 🚗 Dibujar ruta AUTOMÁTICAMENTE si ya hay ambos (pero sin mostrar summary)
      if (originText && destinationText) {
        drawRouteOnly().catch(()=>{ /* silencioso en auto */ });
      }
    });

    ["input","change","blur"].forEach(ev => {
      input.addEventListener(ev, () => {
        const v = (input.value || "").trim();
        if (inputId === "pickup") originText = v; else destinationText = v;
      });
    });
  }

  // ───────── Ruta (solo mapa)
  async function drawRouteOnly() {
    const origin      = originText || document.getElementById("pickup")?.value || "";
    const destination = destinationText || document.getElementById("dropoff")?.value || "";
    if (!origin || !destination) return;

    const req = {
      origin, destination,
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };
    const result = await routeAsync(req);
    const route  = result?.routes?.[0];
    const leg    = route?.legs?.[0];
    if (!route || !leg) return;

    dirRenderer.setDirections(result);
    lastLeg = leg;
    lastRoute = result;
  }

  // ───────── Calcular para Summary (se usa al click en Calculate Price)
  async function computeAndRenderQuote() {
    // si no tenemos ruta dibujada aún, intenta calcularla
    if (!lastLeg) {
      await drawRouteOnly();
    }
    if (!lastLeg) {
      alert("Could not compute a route. Please refine the addresses.");
      return;
    }

    const surcharge = await computeSurchargeAsync();
    if (window.BNZ?.renderQuote) BNZ.renderQuote(lastLeg, { surcharge });
  }

  function wireCalculateListener() {
    document.addEventListener("bnz:calculate", computeAndRenderQuote);
  }

  // ───────── marcador
  function addHomeMarker() {
    try {
      const AdvancedMarker = google.maps.marker?.AdvancedMarkerElement;
      if (AdvancedMarker) {
        new AdvancedMarker({ map, position: DEFAULT_CENTER, title: "Bonanza Transportation" });
      } else {
        new google.maps.Marker({ map, position: DEFAULT_CENTER, title: "Bonanza Transportation" });
      }
    } catch {
      new google.maps.Marker({ map, position: DEFAULT_CENTER, title: "Bonanza Transportation" });
    }
  }

  // ───────── init global
  window.initMap = function () {
    const mapEl = document.getElementById("map");
    if (!mapEl) { console.warn("[maps] #map not found"); return; }
    mapEl.style.opacity = "0"; // fade-in suave

    map = new google.maps.Map(mapEl, {
      center: DEFAULT_CENTER,
      zoom: 11,
      mapId: MAP_ID,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    addHomeMarker();
    dirService  = new google.maps.DirectionsService();
    dirRenderer = new google.maps.DirectionsRenderer({
      map,
      polylineOptions: {
        strokeColor: "#000000",      // ⚫ ruta negra
        strokeOpacity: 0.95,
        strokeWeight: 5
      },
      suppressMarkers: false
    });

    attachAutocomplete("pickup");
    attachAutocomplete("dropoff");

    originText      = document.getElementById("pickup")?.value || originText;
    destinationText = document.getElementById("dropoff")?.value || destinationText;

    // Resize guard
    try {
      const ro = new ResizeObserver(() => {
        if (!map) return;
        const c = map.getCenter();
        google.maps.event.trigger(map, "resize");
        if (c) map.setCenter(c);
      });
      ro.observe(mapEl);
    } catch {}

    wireCalculateListener();

    requestAnimationFrame(() => { mapEl.style.opacity = "1"; });
  };
})();

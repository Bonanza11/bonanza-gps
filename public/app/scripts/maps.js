/*
maps.js — Bonanza Transportation (Google Maps + Places + Rutas)
──────────────────────────────────────────────────────────────
- Inicializa el mapa y Places.
- Autocomplete en pickup/dropoff (solo USA).
- Expuestos globalmente:
    window.pickupPlace, window.dropoffPlace
    window.isSLCInternational(place), window.isAirport(place), window.isUtah(place)
    window.routeAsync(opts)

- Escucha "bnz:calculate" → calcula ruta → BNZ.renderQuote(leg, { surcharge })
- Regla de recargo: $3/mi desde BASE cuando:
  A) pickup es aeropuerto y dropoff está fuera de Summit/Wasatch → BASE→PICKUP
  B) pickup fuera de Summit/Wasatch → BASE→PICKUP

Requiere en HTML:
  <div id="map"></div>
  loadGoogleMaps(key,{ libraries:"places" }).then(()=>window.initMap && window.initMap())
*/
(function () {
  "use strict";

  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // SLC
  const BASE_ADDRESS   = "13742 N Jordanelle Pkwy, Kamas, UT 84036";

  let map, dirService, dirRenderer;
  let acPickup = null, acDropoff = null;

  // Texto libre (cuando el usuario no selecciona una sugerencia)
  let originText = "";
  let destinationText = "";

  // Globals usados por otros módulos
  window.pickupPlace = window.pickupPlace || null;
  window.dropoffPlace = window.dropoffPlace || null;

  // ──────────────────────────────────────────────────────────────
  // Helpers Places/Geocoder
  // ──────────────────────────────────────────────────────────────
  function isAirport(place) {
    const t = place?.types || [];
    const txt = `${place?.name || ""} ${place?.formatted_address || ""}`.toLowerCase();
    return t.includes("airport") || /airport/.test(txt);
  }
  window.isAirport = isAirport;

  function isUtah(place) {
    const addr = (place?.formatted_address || "").toLowerCase();
    return /\but\b/.test(addr) || /, ut(ah)?\b/.test(addr);
  }
  window.isUtah = isUtah;

  function isPrivateUtahAirport(place) {
    if (!place || !isAirport(place) || !isUtah(place)) return false;
    const text = `${place.name || ""} ${place.formatted_address || ""}`;
    const FBO_RX = /\b(fbo|jet center|private terminal|general aviation|hangar|atlantic aviation|million air|signature|ross aviation|tac air|ok3 air|lynx|modern aviation|provo jet center)\b/i;
    return FBO_RX.test(text);
  }

  // SLC comercial (no FBO)
  function isSLCInternational(place) {
    if (!place) return false;
    const name = (place.name || "").toLowerCase();
    const addr = (place.formatted_address || "").toLowerCase();
    const hit = /salt lake city international/.test(name) || /salt lake city international/.test(addr) || /\bslc\b/.test(name) || /\bslc\b/.test(addr);
    return hit && isAirport(place) && !isPrivateUtahAirport(place);
  }
  window.isSLCInternational = isSLCInternational;

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

  // DirectionsService (callback → Promise)
  function routeAsync(opts) {
    return new Promise((resolve, reject) => {
      dirService.route(opts, (r, s) => (s === "OK" && r ? resolve(r) : reject(s || "ROUTE_ERROR")));
    });
  }
  window.routeAsync = routeAsync;

  async function countyByPlaceId(placeId) {
    try {
      const r = await geocodeAsync({ placeId });
      const c = r.address_components.find((x) => x.types?.includes("administrative_area_level_2"));
      return c?.long_name || "";
    } catch (_) {
      return "";
    }
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

  // ──────────────────────────────────────────────────────────────
  // Regla de recargo $3/mi
  // ──────────────────────────────────────────────────────────────
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

    // A) Pickup aeropuerto + drop fuera de Summit/Wasatch → BASE→PICKUP
    if (pickupIsAir) {
      const dropAllowed = ALLOWED_RX.test(dropCounty);
      if (!dropAllowed && pickup?.place_id) {
        const miles = await milesFromBaseTo(pickup.place_id);
        return Math.round(miles * 3 * 100) / 100;
      }
      return 0;
    }

    // B) Pickup normal fuera de Summit/Wasatch → BASE→PICKUP
    const pickupAllowed = ALLOWED_RX.test(pickupCounty);
    if (!pickupAllowed && pickup?.place_id) {
      const miles = await milesFromBaseTo(pickup.place_id);
      return Math.round(miles * 3 * 100) / 100;
    }

    return 0;
  }

  // ──────────────────────────────────────────────────────────────
  // Autocomplete
  // ──────────────────────────────────────────────────────────────
  function attachAutocomplete(inputId, opts = {}) {
    const input = document.getElementById(inputId);
    if (!input) return null;

    const ac = new google.maps.places.Autocomplete(input, {
      fields: ["place_id", "geometry", "name", "formatted_address", "address_components", "types"],
      componentRestrictions: { country: ["us"] },
      ...opts,
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const loc = place?.geometry?.location || null;
      if (loc && map) {
        map.panTo(loc);
        map.setZoom(12);
      }

      const pretty = (place?.formatted_address || place?.name || input.value || "").trim();

      if (inputId === "pickup") {
        originText = pretty;
        window.pickupPlace = place || null;

        if (window.BNZ && typeof BNZ.onPickupPlaceChanged === "function") {
          BNZ.onPickupPlaceChanged(place);
        }
        if (typeof window.updateMeetGreetVisibility === "function") {
          window.updateMeetGreetVisibility();
        }
      } else {
        destinationText = pretty;
        window.dropoffPlace = place || null;
      }
    });

    // Cachear texto libre
    ["input", "change", "blur"].forEach((ev) => {
      input.addEventListener(ev, () => {
        const v = (input.value || "").trim();
        if (inputId === "pickup") originText = v;
        else destinationText = v;
      });
    });

    return ac;
  }

  // ──────────────────────────────────────────────────────────────
  // Routing + quote
  // ──────────────────────────────────────────────────────────────
  async function routeAndQuote() {
    const origin      = originText || document.getElementById("pickup")?.value || "";
    const destination = destinationText || document.getElementById("dropoff")?.value || "";

    if (!origin || !destination) {
      alert("Please enter both Pick-up and Drop-off addresses.");
      return;
    }

    try {
      const req = {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
        provideRouteAlternatives: false,
      };

      // ✅ usar wrapper consistente (callback → Promise)
      const result = await routeAsync(req);
      const route  = result?.routes?.[0];
      const leg    = route?.legs?.[0];

      if (!route || !leg) {
        alert("Could not compute a route. Please refine the addresses.");
        return;
      }

      dirRenderer.setDirections(result);

      // Recargo según reglas
      const surcharge = await computeSurchargeAsync();

      // Notificar al módulo de booking
      if (window.BNZ && typeof BNZ.renderQuote === "function") {
        BNZ.renderQuote(leg, { surcharge });
      }
    } catch (err) {
      console.error("[maps] route error:", err);
      alert("There was an error calculating the route. Try again.");
    }
  }

  function wireCalculateListener() {
    document.addEventListener("bnz:calculate", routeAndQuote);
  }

  // ──────────────────────────────────────────────────────────────
  // Callback global (Google Maps loader)
  // ──────────────────────────────────────────────────────────────
  window.initMap = function () {
    const mapEl = document.getElementById("map");
    if (!mapEl) {
      console.warn("[maps] #map not found");
      return;
    }

    map = new google.maps.Map(mapEl, {
      center: DEFAULT_CENTER,
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    new google.maps.Marker({
      position: DEFAULT_CENTER,
      map,
      title: "Bonanza Transportation",
    });

    dirService  = new google.maps.DirectionsService();
    dirRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      preserveViewport: false,
    });

    // Autocomplete
    acPickup  = attachAutocomplete("pickup");
    acDropoff = attachAutocomplete("dropoff");

    // Respetar texto precargado
    originText      = document.getElementById("pickup")?.value || originText;
    destinationText = document.getElementById("dropoff")?.value || destinationText;

    // Listener de cálculo
    wireCalculateListener();
  };
})();

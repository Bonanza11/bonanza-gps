/*
maps.js — Bonanza Transportation (Google Maps + Places + Rutas)
──────────────────────────────────────────────────────────────
- Inicializa mapa con Map ID.
- Usa Place Autocomplete Element (nuevo API).
- Calcula ruta al disparar "bnz:calculate" y notifica BNZ.renderQuote(leg,{ surcharge }).
- Recargo: $3/mi desde BASE→PICKUP según reglas Summit/Wasatch / Aeropuerto.
*/

(function () {
  "use strict";

  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // SLC
  const BASE_ADDRESS   = "13742 N Jordanelle Pkwy, Kamas, UT 84036";
  const MAP_ID         = "be9f7b3d0f62a46ba10dc0ba"; // <-- tu Map ID

  let map, dirService, dirRenderer;
  let originText = "", destinationText = "";

  window.pickupPlace  = window.pickupPlace  || null;
  window.dropoffPlace = window.dropoffPlace || null;

  // ─────────────── helpers
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

  function isSLCInternational(place) {
    if (!place) return false;
    const name = (place.name || "").toLowerCase();
    const addr = (place.formatted_address || "").toLowerCase();
    const hit  = /salt lake city international/.test(name) || /salt lake city international/.test(addr) || /\bslc\b/.test(name) || /\bslc\b/.test(addr);
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

  // ─────────────── recargo $3/mi
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

  // ─────────────── Autocomplete con nuevo API
  function attachAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const ac = new google.maps.places.PlaceAutocompleteElement({
      inputElement: input,
      fields: ["place_id","geometry","name","formatted_address","address_components","types"],
      componentRestrictions: { country: "us" },
    });

    ac.addEventListener("gmp-placeselect", (e) => {
      const place = e.place;
      if (!place) return;

      if (place.geometry?.location && map) {
        map.panTo(place.geometry.location);
        map.setZoom(12);
      }

      const pretty = (place.formatted_address || place.name || input.value || "").trim();

      if (inputId === "pickup") {
        originText = pretty;
        window.pickupPlace = place;
        if (window.BNZ?.onPickupPlaceChanged) BNZ.onPickupPlaceChanged(place);
        if (window.updateMeetGreetVisibility) window.updateMeetGreetVisibility();
      } else {
        destinationText = pretty;
        window.dropoffPlace = place;
      }
    });

    input.addEventListener("input", () => {
      const v = (input.value || "").trim();
      if (inputId === "pickup") originText = v; else destinationText = v;
    });
  }

  // ─────────────── Routing + Quote
  async function routeAndQuote() {
    const origin      = originText || document.getElementById("pickup")?.value || "";
    const destination = destinationText || document.getElementById("dropoff")?.value || "";

    if (!origin || !destination) {
      alert("Please enter both Pick-up and Drop-off addresses.");
      return;
    }

    try {
      const req = {
        origin, destination,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      };

      const result = await routeAsync(req);
      const route  = result?.routes?.[0];
      const leg    = route?.legs?.[0];
      if (!route || !leg) { alert("Could not compute a route. Please refine the addresses."); return; }

      dirRenderer.setDirections(result);

      const surcharge = await computeSurchargeAsync();
      if (window.BNZ?.renderQuote) BNZ.renderQuote(leg, { surcharge });
    } catch (err) {
      console.error("[maps] route error:", err);
      alert("There was an error calculating the route. Try again.");
    }
  }

  function wireCalculateListener() {
    document.addEventListener("bnz:calculate", routeAndQuote);
  }

  // ─────────────── marcador: AdvancedMarker o Marker
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

  // ─────────────── callback global
  window.initMap = function () {
    const mapEl = document.getElementById("map");
    if (!mapEl) { console.warn("[maps] #map not found"); return; }

    map = new google.maps.Map(mapEl, {
      center: DEFAULT_CENTER,
      zoom: 11,
      mapId: MAP_ID, // ahora con tu Map ID
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    addHomeMarker();
    dirService  = new google.maps.DirectionsService();
    dirRenderer = new google.maps.DirectionsRenderer({ map });

    attachAutocomplete("pickup");
    attachAutocomplete("dropoff");

    originText      = document.getElementById("pickup")?.value || originText;
    destinationText = document.getElementById("dropoff")?.value || destinationText;

    wireCalculateListener();
  };
})();

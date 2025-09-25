/*
maps.js — Bonanza Transportation (Google Maps + Places + Rutas)
──────────────────────────────────────────────────────────────
- Inicializa el mapa.
- Autocomplete en pickup/dropoff (solo USA).
- En place_changed del pickup dispara BNZ.onPickupPlaceChanged(place).
- Calcula ruta (origin→destination) al evento "bnz:calculate".
- Dibuja la ruta y pasa el primer leg a BNZ.renderQuote(leg, { surcharge }).

Requiere en HTML:
  <div id="map"></div>
  <script defer src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY&libraries=places&callback=initMap"></script>
*/

(function () {
  "use strict";

  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // Salt Lake City

  let map, dirService, dirRenderer;
  let acPickup = null, acDropoff = null;

  // Cache de textos para la ruta (por si el usuario teclea manualmente)
  let originText = "";
  let destinationText = "";

  // Si más adelante necesitas recargos por zona/distancia, ajústalo aquí:
  function computeSurcharge(miles) {
    return 0;
  }

  // ----- Autocomplete helper -------------------------------------------------
  function attachAutocomplete(inputId, opts = {}) {
    const input = document.getElementById(inputId);
    if (!input) return null;

    const ac = new google.maps.places.Autocomplete(input, {
      fields: ["place_id", "geometry", "name", "formatted_address"],
      componentRestrictions: { country: ["us"] },
      ...opts,
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();

      // Centrar el mapa si hay geometry
      const loc = place?.geometry?.location || null;
      if (loc) {
        map.panTo(loc);
        map.setZoom(12);
      }

      // Texto “bonito” para la ruta
      const pretty = (place?.formatted_address || place?.name || input.value || "").trim();

      if (inputId === "pickup") {
        originText = pretty;
        // Hook para Booking (decide JSX/FBO/Aeropuerto/M&G)
        if (window.BNZ && typeof BNZ.onPickupPlaceChanged === "function") {
          BNZ.onPickupPlaceChanged(place);
        }
      } else {
        destinationText = pretty;
      }
    });

    // También cachea cambios manuales
    ["input","change","blur"].forEach(ev => {
      input.addEventListener(ev, () => {
        const v = (input.value || "").trim();
        if (inputId === "pickup") originText = v;
        else destinationText = v;
      });
    });

    return ac;
  }

  // ----- Routing + quote -----------------------------------------------------
  async function routeAndQuote() {
    const origin = originText || document.getElementById("pickup")?.value || "";
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

      const result = await dirService.route(req);
      const route = result?.routes?.[0];
      const leg = route?.legs?.[0];

      if (!route || !leg) {
        alert("Could not compute a route. Please refine the addresses.");
        return;
      }

      // Dibuja ruta
      dirRenderer.setDirections(result);

      // Surcharge opcional
      const miles = leg.distance?.value ? (leg.distance.value / 1609.34) : 0;
      const surcharge = computeSurcharge(miles);

      // Notifica al módulo de booking
      if (window.BNZ && typeof BNZ.renderQuote === "function") {
        BNZ.renderQuote(leg, { surcharge });
      }
    } catch (err) {
      console.error("[maps] route error:", err);
      alert("There was an error calculating the route. Try again.");
    }
  }

  // Escucha del evento que dispara booking: document.dispatchEvent(new CustomEvent('bnz:calculate'))
  function wireCalculateListener() {
    document.addEventListener("bnz:calculate", routeAndQuote);
  }

  // ----- Callback global para el loader de Google ----------------------------
  // Debe existir antes de que Google intente llamarlo.
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

    // Si había texto pre-cargado, respétalo
    originText      = document.getElementById("pickup")?.value     || originText;
    destinationText = document.getElementById("dropoff")?.value    || destinationText;

    // Conectar “Calculate”
    wireCalculateListener();
  };
})();

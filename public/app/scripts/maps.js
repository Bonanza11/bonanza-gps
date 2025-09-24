/*
maps.js — Bonanza Transportation (Google Maps + Places + Rutas)
──────────────────────────────────────────────────────────────
Responsable de:
- Inicializar el mapa principal de Google Maps.
- Autocomplete en pickup/dropoff (solo USA).
- Detectar cambios en pickup → BNZ.onPickupPlaceChanged(place) para UI (JSX/FBO/Aeropuerto).
- Calcular ruta (origin→destination) al evento "bnz:calculate".
- Dibujar la ruta y pasar el primer leg a BNZ.renderQuote(leg, { surcharge }).

Requisitos en HTML:
- <div id="map"></div>
- Script de Google:
  <script async src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY&libraries=places&callback=initMap"></script>
*/

(function () {
  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // Salt Lake City

  let map, dirService, dirRenderer;
  let acPickup = null;
  let acDropoff = null;

  // Cache de textos para ruta
  let originText = "";
  let destinationText = "";

  // --- Surcharge (si lo necesitas luego) ---
  // Por ahora 0; si quieres reglas por condado/distancia, ajusta aquí.
  function computeSurcharge(miles) {
    return 0;
  }

  // Helper: crea Autocomplete, centra y dispara hooks
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
      if (place && place.geometry && place.geometry.location) {
        map.panTo(place.geometry.location);
        map.setZoom(12);
      }

      // Guardar textos para la ruta
      const pretty =
        (place && (place.formatted_address || place.name)) || input.value || "";

      if (inputId === "pickup") {
        originText = pretty;
        // Hook para Booking (aquí decide mostrar Flight/JSX/FBO/M&G)
        if (window.BNZ && typeof BNZ.onPickupPlaceChanged === "function") {
          BNZ.onPickupPlaceChanged(place);
        }
      } else if (inputId === "dropoff") {
        destinationText = pretty;
      }
    });

    // También captura cambios manuales
    ["input", "change", "blur"].forEach((ev) => {
      input.addEventListener(ev, () => {
        const val = input.value || "";
        if (inputId === "pickup") originText = val;
        if (inputId === "dropoff") destinationText = val;
      });
    });

    return ac;
  }

  async function routeAndQuote() {
    const origin =
      originText || document.getElementById("pickup")?.value || "";
    const destination =
      destinationText || document.getElementById("dropoff")?.value || "";

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

      // Dibuja la ruta
      dirRenderer.setDirections(result);

      // Surcharge opcional (ahora 0; puedes cambiar computeSurcharge)
      const miles = leg.distance?.value ? leg.distance.value / 1609.34 : 0;
      const surcharge = computeSurcharge(miles);

      // Pasar leg a Booking para renderizar y calcular totales
      if (window.BNZ && typeof BNZ.renderQuote === "function") {
        BNZ.renderQuote(leg, { surcharge });
      }
    } catch (err) {
      console.error("[maps] route error:", err);
      alert("There was an error calculating the route. Try again.");
    }
  }

  // Listener global desde booking.js → document.dispatchEvent(new CustomEvent('bnz:calculate'))
  function wireCalculateListener() {
    document.addEventListener("bnz:calculate", routeAndQuote);
  }

  // Callback global para el <script ...&callback=initMap>
  window.initMap = function () {
    const mapEl = document.getElementById("map");
    if (!mapEl) {
      console.warn("[maps] No se encontró #map");
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

    dirService = new google.maps.DirectionsService();
    dirRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: false,
      preserveViewport: false,
      map,
    });

    // Autocomplete en ambos campos
    acPickup = attachAutocomplete("pickup");
    acDropoff = attachAutocomplete("dropoff");

    // Si ya hay texto pre-cargado, guárdalo
    originText = document.getElementById("pickup")?.value || originText;
    destinationText = document.getElementById("dropoff")?.value || destinationText;

    // Escuchar el “Calculate”
    wireCalculateListener();
  };
})();

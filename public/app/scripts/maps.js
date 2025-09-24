/*
maps.js — Bonanza Transportation (Google Maps + Places)
──────────────────────────────────────────────────────
Responsable de:
- Inicializar el mapa principal de Google Maps.
- Integrar Google Places Autocomplete en los campos pickup/dropoff.
- Agregar marker inicial en Salt Lake City.
- Exponer `initMap` globalmente (callback del script de Google).

Requisitos:
- <div id="map"></div> en el HTML.
- Cargar el script de Google así:
  <script async src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY&libraries=places&callback=initMap"></script>
*/

(function () {
  const DEFAULT_CENTER = { lat: 40.7608, lng: -111.8910 }; // Salt Lake City

  // Se define antes de que cargue Google para que el callback exista seguro.
  window.initMap = function () {
    const mapEl = document.getElementById("map");
    if (!mapEl) { console.warn("[maps] No se encontró #map"); return; }

    const map = new google.maps.Map(mapEl, {
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

    // Helper para crear Autocomplete y centrar el mapa al elegir.
    const attachAutocomplete = (inputId) => {
      const input = document.getElementById(inputId);
      if (!input) return null;

      const ac = new google.maps.places.Autocomplete(input, {
        fields: ["place_id", "geometry", "name", "formatted_address"],
        // Limita a direcciones de Estados Unidos
        componentRestrictions: { country: ["us"] },
      });

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place && place.geometry && place.geometry.location) {
          map.panTo(place.geometry.location);
          map.setZoom(12);
        }
      });

      return ac;
    };

    attachAutocomplete("pickup");
    attachAutocomplete("dropoff");
  };
})();

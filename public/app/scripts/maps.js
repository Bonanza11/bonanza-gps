/*
maps.js — Bonanza Transportation (Google Maps + Places)
──────────────────────────────────────────────────────
Responsable de:
- Inicializar el mapa principal de Google Maps.
- Integrar Google Places Autocomplete en los campos pickup/dropoff.
- Agregar marker inicial en Park City/SLC (editable).
- Exponer `initMap` globalmente (Google Maps callback).

Dependencias:
  - Google Maps JavaScript API con librería "places"
  - HTML con <div id="map"></div>
*/
(function () {
  function initMap() {
    const center = { lat: 40.7608, lng: -111.8910 }; // Salt Lake City
    const map = new google.maps.Map(document.getElementById('map'), {
      center,
      zoom: 10,
    });

    // Marker base
    new google.maps.Marker({
      position: center,
      map,
      title: "Bonanza Transportation",
    });

    // Autocomplete en pickup y dropoff
    const pickupInput = document.getElementById("pickup");
    const dropoffInput = document.getElementById("dropoff");
    if (pickupInput) new google.maps.places.Autocomplete(pickupInput);
    if (dropoffInput) new google.maps.places.Autocomplete(dropoffInput);
  }

  // Exponer como callback global
  window.initMap = initMap;
})();

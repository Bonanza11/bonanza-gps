/* =========================================================
   Archivo: maps.js
   Rol:
     - Inicialización de Google Maps
     - Autocomplete pickup/dropoff
     - Calcular ruta y distancia
   ========================================================= */
window.BNZ = window.BNZ || {};

(function(){
  let map,directionsService,directionsRenderer,geocoder;
  BNZ.initMap = function(){
    map=new google.maps.Map(document.getElementById("map"),{center:{lat:40.76,lng:-111.89},zoom:9});
    directionsService=new google.maps.DirectionsService();
    directionsRenderer=new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);
    geocoder=new google.maps.Geocoder();

    const pInput=document.getElementById("pickup");
    const dInput=document.getElementById("dropoff");
    if(pInput) new google.maps.places.Autocomplete(pInput);
    if(dInput) new google.maps.places.Autocomplete(dInput);
  };

  BNZ.calcRoute = async function(pickup,dropoff){
    return new Promise((res,rej)=>{
      directionsService.route({
        origin:pickup, destination:dropoff, travelMode:"DRIVING"
      },(resp,status)=>{
        if(status==="OK") res(resp);
        else rej(status);
      });
    });
  };
})();

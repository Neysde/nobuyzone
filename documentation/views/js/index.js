let locationButton = document.getElementById("locationButton");
let map = null;
let fullscreenToggle = document.getElementById("fullscreen-toggle");
let mapContainer = document.getElementById("map");
let city = document.getElementById("city");
let district = document.getElementById("district");
let street = document.getElementById("street");
let road = document.getElementById("road");

// Initialize map with default view
function initMap() {
  map = L.map("map").setView([0, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "Map data © OpenStreetMap",
  }).addTo(map);
}

// Initialize map when html document is loaded
document.addEventListener("DOMContentLoaded", initMap);

// Toggle fullscreen mode
fullscreenToggle.addEventListener("click", () => {
  mapContainer.classList.toggle("fullscreen");

  // Update map size after transition
  setTimeout(() => {
    map.invalidateSize(); //recalculates map dimensions
    fullscreenToggle.textContent = mapContainer.classList.contains("fullscreen")
      ? "Exit Fullscreen"
      : "Fullscreen";
  }, 300);
});

// Add a circle for approximate location
function showApproximateLocation(lat, lon) {
  if (!map) initMap();

  // Add random offset to hide exact location (0.01 ≈ 1km) now -300 +300m
  const offset = 0.003;
  const centerLat = lat + (Math.random() * offset * 2 - offset);
  const centerLon = lon + (Math.random() * offset * 2 - offset);

  // Clear previous circles
  map.eachLayer((layer) => {
    if (layer instanceof L.Circle) map.removeLayer(layer);
  });

  // Add circle with radius that includes actual location
  const radiusMeters = 200; // ~0.2km radius circle
  const circle = L.circle([centerLat, centerLon], {
    color: "red",
    fillColor: "#f03",
    fillOpacity: 0.3,
    radius: radiusMeters,
  }).addTo(map);

  // Zoom map to show circle number changes zoom level
  map.setView([centerLat, centerLon], 16.3);
}

locationButton.addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // Show approximate location on map
      showApproximateLocation(lat, lon);

      // Get reverse geocode data from server
      fetch("/api/reversegeocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          console.log(data);
          city.textContent = data.address.province;
          district.textContent = data.address.town;
          street.textContent = data.address.suburb;
          road.textContent = data.address.road;
        });
    },
    (error) => {
      console.error("Error getting location:", error.message);
    },
    {
      enableHighAccuracy: true,
    }
  );
});

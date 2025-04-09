// Get map container from the listing page
let listingMapContainer = document.getElementById("listing-map");
let listingMap = null;
// Declare but don't initialize the fullscreenToggle yet
let fullscreenToggle;

/**
 * Initialize the Leaflet map for the product listing page.
 * This sets up the map with the OpenStreetMap tile layer.
 */
function initListingMap() {
  if (!listingMapContainer) return; // Exit if map container doesn't exist

  // Initialize the Leaflet map if it hasn't been initialized already
  if (!listingMap) {
    listingMap = L.map(listingMapContainer).setView([0, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "Map data © OpenStreetMap",
    }).addTo(listingMap);
  }
}

function showApproximateLocation(centerLat, centerLon, radiusMeters) {
  if (!listingMap) initListingMap();

  // Clear previous circles
  listingMap.eachLayer((layer) => {
    if (layer instanceof L.Circle) listingMap.removeLayer(layer);
  });

  // Add circle with radius that includes actual location
  const circle = L.circle([centerLat, centerLon], {
    color: "red",
    fillColor: "#f03",
    fillOpacity: 0.3,
    radius: radiusMeters,
  }).addTo(listingMap);

  // Zoom map to show circle
  listingMap.setView([centerLat, centerLon], 15);
}

//Fetch location data from the server API. This retrieves the approximate location for the current listing. In production we will fetch based on the listingId.
function fetchLocationData() {
  // Get listing ID from URL if available (for future use)
  const urlParams = new URLSearchParams(window.location.search);
  const listingId = urlParams.get("id");

  // Construct the API URL
  const apiUrl = listingId
    ? `/api/listinglocation/${listingId}`
    : "/api/listinglocation";

  // Fetch location data
  fetch(apiUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      if (data.error) {
        console.error("Error from server:", data.error.message);
        return;
      }

      // Update location display name if available
      const locationNameElement = document.querySelector(".location-name");
      if (locationNameElement && data.location.displayName) {
        locationNameElement.textContent = data.location.displayName;
      }

      // Show the location on the map
      showApproximateLocation(
        data.location.centerLat,
        data.location.centerLon,
        data.location.radiusMeters
      );
    })
    .catch((error) => {
      console.error("Failed to fetch location data:", error);
    });
}

// Wait for the DOM to load
document.addEventListener("DOMContentLoaded", function () {
  // Initialize map if on the listing page
  if (listingMapContainer) {
    // Initialize fullscreenToggle only after DOM is loaded
    fullscreenToggle = document.getElementById("fullscreen-toggle");

    // Initialize and fetch location data
    initListingMap();
    fetchLocationData();

    // Toggle fullscreen mode (if button exists)
    if (fullscreenToggle) {
      fullscreenToggle.addEventListener("click", () => {
        // Get the map container (parent of the map div)
        const mapContainer = listingMapContainer.parentElement;
        mapContainer.classList.toggle("fullscreen");

        // Update map size after transition
        setTimeout(() => {
          listingMap.invalidateSize(); // recalculates map dimensions
          fullscreenToggle.textContent = mapContainer.classList.contains(
            "fullscreen"
          )
            ? "Exit Fullscreen"
            : "Fullscreen";
        }, 300);
      });
    }
  }

  // Handle thumbnail gallery
  const thumbnails = document.querySelectorAll(".thumbnail");
  const mainImage = document.querySelector(".main-image img");

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", function () {
      // Remove active class from all thumbnails
      thumbnails.forEach((t) => t.classList.remove("active"));

      // Add active class to clicked thumbnail
      this.classList.add("active");

      // Update main image source
      const imgSrc = this.querySelector("img").getAttribute("src");
      mainImage.setAttribute("src", imgSrc);
    });
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      navLinks.classList.toggle("active");
    });
  }

  // Scroll to top button
  const scrollButton = document.createElement("button");
  scrollButton.classList.add("scroll-top");
  scrollButton.innerHTML = "↑";
  document.body.appendChild(scrollButton);

  window.addEventListener("scroll", function () {
    if (window.scrollY > 300) {
      scrollButton.classList.add("visible");
    } else {
      scrollButton.classList.remove("visible");
    }
  });

  scrollButton.addEventListener("click", function () {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
});

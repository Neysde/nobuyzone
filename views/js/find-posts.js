/**
 * Find Posts Page JavaScript
 * Handles filtering, sorting, and pagination for the barter items listing page
 */

document.addEventListener("DOMContentLoaded", function () {
  // Cache DOM elements
  const categoryButtons = document.querySelectorAll(".category-button");
  const sortSelect = document.getElementById("sort-options");
  const postsGrid = document.querySelector(".posts-grid");
  const resultsCount = document.getElementById("results-count");
  const prevButton = document.querySelector(".pagination-button:first-child");
  const nextButton = document.querySelector(".pagination-button:last-child");
  const globalSearchInput = document.getElementById("global-search-input");
  const globalCategories = document.getElementById("global-categories");
  const globalCity = document.getElementById("global-city");
  const globalDistrict = document.getElementById("global-district");
  // Radius search elements
  const radiusMap = document.getElementById("radius-map");
  const radiusSlider = document.getElementById("radius-slider");
  const radiusValue = document.getElementById("radius-value");
  const locationDisplay = document.getElementById("location-display");
  const useMyLocationBtn = document.getElementById("use-my-location");
  const searchRadiusBtn = document.getElementById("search-radius-button");
  const fullscreenToggleBtn = document.getElementById(
    "radius-fullscreen-toggle"
  );
  const globalSearchButton = document.getElementById("global-search-button");
  const apiKey = "67f036a6524c4571002304nfp4826b8"; // Will be moved to .env

  // Data variables for location
  let cities = [];
  let districts = [];

  // Map variables
  let map = null;
  let radiusCircle = null;
  let centerMarker = null;
  let currentCenter = null;
  let currentRadius = 10; // Default radius in km

  // Rate limiting queue
  let lastRequestTime = 0;
  let MIN_REQUEST_INTERVAL;

  // State variables
  let currentFilters = {
    category: "all",
    search: "",
    city: "",
    district: "",
    sort: "newest",
    page: 1,
    // Add radius search parameters
    useRadius: false,
    radiusLat: null,
    radiusLng: null,
    radiusKm: 10,
  };

  // Fetch configuration from the server
  fetch("/api/config")
    .then((response) => response.json())
    .then((config) => {
      apiKey = config.GEOCODING_API_KEY;
      MIN_REQUEST_INTERVAL = config.MIN_REQUEST_INTERVAL;
    })
    .catch((error) => {
      console.error("Error loading configuration:", error);
    });

  // Initialize the map
  function initRadiusMap() {
    // Only initialize if element exists and map hasn't been initialized
    if (!radiusMap || map) return;

    // Create container for fixed circle overlay
    const fixedOverlayContainer = document.createElement("div");
    fixedOverlayContainer.className = "fixed-overlay-container";
    fixedOverlayContainer.style.position = "absolute";
    fixedOverlayContainer.style.top = "0";
    fixedOverlayContainer.style.left = "0";
    fixedOverlayContainer.style.width = "100%";
    fixedOverlayContainer.style.height = "100%";
    fixedOverlayContainer.style.pointerEvents = "none";
    fixedOverlayContainer.style.zIndex = "450";
    radiusMap.appendChild(fixedOverlayContainer);

    // Create map instance
    map = L.map(radiusMap, {
      zoomControl: false, // We'll add zoom control manually
    }).setView([39.9334, 32.8597], 10); // Default center on Ankara, Turkey

    // Add tile layer (map style)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control to top-left
    L.control
      .zoom({
        position: "topleft",
      })
      .addTo(map);

    // Initialize the fixed circle overlay
    initFixedCircleOverlay(fixedOverlayContainer);

    // Set up map events
    setupMapEvents();

    // Set up radius controls
    setupRadiusControls();

    // Trigger initial update to populate city/district based on starting position
    currentCenter = map.getCenter();
    updateRadiusFromFixedCircle();
    updateMaskCircle(currentCenter);

    // Initialize city/district selector with starting position after short delay
    setTimeout(async () => {
      await updateCityDistrictFromMap(currentCenter);
      updateLocationInfo(currentCenter);
    }, 500);
  }

  // Initialize the fixed circle overlay with the tinted area
  function initFixedCircleOverlay(container) {
    // Create SVG element with 100% dimensions
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    container.appendChild(svg);

    // Create mask definition
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);

    const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    mask.setAttribute("id", "fixed-circle-mask");
    defs.appendChild(mask);

    // White background for the mask (the tinted area)
    const background = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "white");
    mask.appendChild(background);

    // Black circle for the mask (the clear area)
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    // Position in the center of the container
    circle.setAttribute("cx", "50%");
    circle.setAttribute("cy", "50%");

    // Initial fixed radius in pixels (will be updated based on container size)
    const containerWidth = container.clientWidth;
    const initialRadiusInPixels = Math.min(containerWidth * 0.35, 150);
    circle.setAttribute("r", initialRadiusInPixels);
    circle.setAttribute("fill", "black");
    mask.appendChild(circle);

    // Create the tinted overlay that will be masked
    const overlay = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    overlay.setAttribute("x", "0");
    overlay.setAttribute("y", "0");
    overlay.setAttribute("width", "100%");
    overlay.setAttribute("height", "100%");
    overlay.setAttribute("fill", "rgba(96, 165, 250, 0.2)"); // Blue tint matching primary color
    overlay.setAttribute("mask", "url(#fixed-circle-mask)");
    svg.appendChild(overlay);

    // Create a border circle for the fixed area (just for visual reference)
    const borderCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    borderCircle.setAttribute("cx", "50%");
    borderCircle.setAttribute("cy", "50%");
    borderCircle.setAttribute("r", initialRadiusInPixels);
    borderCircle.setAttribute("fill", "none");
    borderCircle.setAttribute("stroke", "var(--primary)");
    borderCircle.setAttribute("stroke-width", "2");
    borderCircle.setAttribute("stroke-opacity", "0.8");
    svg.appendChild(borderCircle);

    // Add a center dot to indicate the exact center point
    const centerDot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    centerDot.setAttribute("cx", "50%");
    centerDot.setAttribute("cy", "50%");
    centerDot.setAttribute("r", "3");
    centerDot.setAttribute("fill", "var(--primary)");
    centerDot.setAttribute("stroke", "white");
    centerDot.setAttribute("stroke-width", "1");
    svg.appendChild(centerDot);

    // Store references for later updates
    window.fixedCircleElements = {
      container: container,
      svg: svg,
      circle: circle,
      borderCircle: borderCircle,
      centerDot: centerDot,
      initialRadiusInPixels: initialRadiusInPixels,
    };

    // Set the initial radius in km based on the current map zoom
    updateRadiusFromFixedCircle();

    // Update on window resize
    window.addEventListener("resize", function () {
      updateFixedCircleSize();
    });
  }

  // Update the fixed circle size when container is resized
  function updateFixedCircleSize() {
    if (!window.fixedCircleElements) return;

    const container = window.fixedCircleElements.container;
    const circle = window.fixedCircleElements.circle;
    const borderCircle = window.fixedCircleElements.borderCircle;

    // Calculate new radius based on container size
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const newRadiusInPixels = Math.min(
      Math.min(containerWidth, containerHeight) * 0.35,
      150
    );

    // Update circle and border circle radius
    circle.setAttribute("r", newRadiusInPixels);
    borderCircle.setAttribute("r", newRadiusInPixels);

    // Store new radius
    window.fixedCircleElements.initialRadiusInPixels = newRadiusInPixels;

    // Update the search radius in km
    updateRadiusFromFixedCircle();
  }

  // Calculate geographic radius in km based on the fixed circle
  function updateRadiusFromFixedCircle() {
    if (!window.fixedCircleElements || !map) return;

    // Get the center point of the map in pixels
    const centerPoint = map.getSize().divideBy(2);

    // Get the radius in pixels
    const radiusInPixels = window.fixedCircleElements.initialRadiusInPixels;

    // Create a point at the edge of the circle (horizontally from center)
    const edgePoint = L.point(centerPoint.x + radiusInPixels, centerPoint.y);

    // Convert both center and edge points to geographical coordinates
    const centerLatLng = map.containerPointToLatLng(centerPoint);
    const edgeLatLng = map.containerPointToLatLng(edgePoint);

    // Calculate the geographical distance between these points
    const radiusInMeters = centerLatLng.distanceTo(edgeLatLng);

    // Convert to kilometers and update the global radius variable
    currentRadius = radiusInMeters / 1000;

    // Set the current center to the map center point (no more separate marker)
    currentCenter = map.getCenter();

    console.log(
      `Fixed circle radius: ${radiusInPixels}px, Geographic radius: ${currentRadius.toFixed(
        1
      )} km`
    );

    // Update location info to show new radius and location
    updateLocationInfo(currentCenter);

    return currentRadius;
  }

  /**
   * Update the SVG mask circle position and radius based on center coordinates
   * @param {Array|Object} center - Center coordinates [lat, lng] or {lat, lng}
   */
  function updateMaskCircle(center) {
    // Check if SVG elements exist
    if (!window.fixedCircleElements) return;

    const elements = window.fixedCircleElements;
    const circle = elements.circle;
    const borderCircle = elements.borderCircle;
    const centerDot = elements.centerDot;

    // Default to center of map if no coordinates provided
    const centerCoords = center || map.getCenter();

    // Convert lat/lng format to object format if needed
    const lat = Array.isArray(centerCoords)
      ? centerCoords[0]
      : centerCoords.lat;
    const lng = Array.isArray(centerCoords)
      ? centerCoords[1]
      : centerCoords.lng;

    // Calculate radius in pixels based on zoom level
    const radiusInPixels = elements.initialRadiusInPixels;

    // All SVG elements are centered by default at 50%, 50%
    // We don't need to update position because the overlay is absolutely positioned

    // Update the radius if needed (useful when zoom changes)
    circle.setAttribute("r", radiusInPixels);
    borderCircle.setAttribute("r", radiusInPixels);

    console.log(
      `Updated mask circle for center: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
    );
  }

  // Set up map events
  function setupMapEvents() {
    // Use a debounced approach for heavy operations
    let moveTimeout = null;

    // When map stops moving, update info that requires API calls
    map.on("moveend", function () {
      // Update current center to the map center
      currentCenter = map.getCenter();

      // Update the geographic radius calculation
      updateRadiusFromFixedCircle();

      // Update the mask circle
      updateMaskCircle(currentCenter);

      // Clear any existing timeout
      if (moveTimeout) clearTimeout(moveTimeout);

      // Set a new timeout to update location and city/district selectors after a delay
      moveTimeout = setTimeout(async function () {
        // Update location info and city/district selectors
        await updateCityDistrictFromMap(currentCenter);

        // Also update location display text
        await waitForRateLimit();
        updateLocationInfo(currentCenter);
      }, 300); // Shorter delay for better responsiveness
    });

    // During map movement, just keep mask updated
    map.on("move", function () {
      updateMaskCircle(map.getCenter());
    });

    // When map zoom changes, update the fixed circle radius
    map.on("zoomend", function () {
      updateRadiusFromFixedCircle();
      updateMaskCircle(map.getCenter());
    });

    // Handle fullscreen toggle
    const fullscreenButton = document.getElementById(
      "radius-fullscreen-toggle"
    );
    fullscreenButton.addEventListener("click", toggleFullscreen);

    // Handle exiting fullscreen with ESC key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && map) {
        const mapContainer = map.getContainer();
        if (mapContainer.classList.contains("fullscreen")) {
          toggleFullscreen();
        }
      }
    });
  }

  // Toggle fullscreen mode
  function toggleFullscreen() {
    radiusMap.classList.toggle("fullscreen");

    // Force map to recalculate size when toggling fullscreen
    setTimeout(function () {
      map.invalidateSize();

      // Update fixed circle size after container resize
      updateFixedCircleSize();
    }, 100);
  }

  // Update location information display
  function updateLocationInfo(latlng) {
    // Reverse geocode to get address
    reverseGeocode(latlng.lat, latlng.lng)
      .then((data) => {
        // Format location text based on geocoding result
        let locationText = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;

        // Check if we have valid geocoding data
        if (data && !data.error) {
          // Try to construct a readable address from the geocoding result
          const address = [];

          // Add parts of the address if they exist
          if (data.address) {
            // Add road/street if available
            if (data.address.road || data.address.street) {
              address.push(data.address.road || data.address.street);
            }

            // Add city/town/village
            if (
              data.address.city ||
              data.address.town ||
              data.address.village
            ) {
              address.push(
                data.address.city || data.address.town || data.address.village
              );
            }

            // Add state/country
            if (data.address.state || data.address.country) {
              address.push(data.address.state || data.address.country);
            }
          }

          // If we couldn't extract structured address parts, try display_name
          if (address.length === 0 && data.display_name) {
            locationText = shortenAddress(data.display_name);
          } else if (address.length > 0) {
            locationText = address.join(", ");
          }
        }

        // Update the display with location and radius
        locationDisplay.textContent = `${locationText}, Radius: ${currentRadius.toFixed(
          1
        )} km`;
      })
      .catch((error) => {
        console.error("Error updating location info:", error);
        // If geocoding fails, just show coordinates
        locationDisplay.textContent = `${latlng.lat.toFixed(
          4
        )}, ${latlng.lng.toFixed(4)}, Radius: ${currentRadius.toFixed(1)} km`;
      });
  }

  //reverse geocode and wait for rate limit
  async function waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      //code will wait until this promise is resolved
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();
  }

  async function reverseGeocode(lat, lon) {
    try {
      await waitForRateLimit();
      const url = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error in reverseGeocode:", error);
      return { error: { message: "Failed to fetch geocode data" } };
    }
  }

  // Shorten address to make it more readable
  function shortenAddress(address) {
    // Split by commas and take first few parts
    const parts = address.split(",");

    if (parts.length > 3) {
      // Return first, third, and last part (typically street, city, country)
      return [parts[0], parts[2], parts[parts.length - 1]]
        .map((part) => part.trim())
        .join(", ");
    }

    return address;
  }

  // Show notification
  function showNotification(message, type = "info") {
    // Create notification element if it doesn't exist
    let notification = document.querySelector(".notification");

    if (!notification) {
      notification = document.createElement("div");
      notification.className = "notification";
      document.body.appendChild(notification);
    }

    // Set message and type
    notification.textContent = message;
    notification.className = `notification ${type}`;

    // Show notification
    setTimeout(() => {
      notification.classList.add("show");
    }, 10);

    // Hide after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");

      // Remove after animation
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Load city and district data
  async function loadLocationData() {
    try {
      console.log("Fetching location data...");
      const [ilResponse, ilceResponse] = await Promise.all([
        fetch("/backend/json/il.json"),
        fetch("/backend/json/ilce.json"),
      ]);

      if (!ilResponse.ok || !ilceResponse.ok) {
        console.error(
          "Failed to load location data. Status codes:",
          ilResponse.status,
          ilceResponse.status
        );
        throw new Error("Failed to load location data");
      }

      const ilJson = await ilResponse.json();
      const ilceJson = await ilceResponse.json();

      // Extract data arrays from JSON
      cities = ilJson.find((item) => item.name === "il").data; //finds the object which contains "il" in its name property
      //and after that it accesses the data property of that object by .data, which is an array of city objects.
      districts = ilceJson.find((item) => item.name === "ilce").data;

      // Populate city dropdowns - only global search now
      populateCityDropdowns();
    } catch (error) {
      console.error("Error loading location data:", error);
    }
  }

  /**
   * Populate city dropdowns with data from the JSON file
   */
  function populateCityDropdowns() {
    // Sort cities alphabetically by name
    cities.sort((a, b) => a.name.localeCompare(b.name)); //a and b are city objects. This compares its names and sorts them in alphabetical order.

    //Clear and populate global city select
    globalCity.innerHTML = '<option value="">Select City</option>';

    //Clear and populate radius search city select
    const radiusCity = document.getElementById("radius-city");
    radiusCity.innerHTML = '<option value="">Select City</option>';

    //Add cities to both dropdowns
    cities.forEach((city) => {
      //Add to global search
      const globalOption = document.createElement("option");
      globalOption.value = city.id;
      globalOption.textContent = city.name;
      globalCity.appendChild(globalOption);

      //Add to radius search
      const radiusOption = document.createElement("option");
      radiusOption.value = city.id;
      radiusOption.textContent = city.name;
      radiusCity.appendChild(radiusOption);
    });
  }

  /**
   * Populate district options for the global search based on selected city
   * @param {string} cityId - Selected city ID
   */
  async function populateDistrictsGlobal(cityId) {
    // Wait for rate limit before updating UI
    try {
      await waitForRateLimit();
    } catch (error) {
      console.error("Error waiting for rate limit:", error);
    }

    // Clear current options except the first one
    globalDistrict.innerHTML = '<option value="">Select District</option>';

    // If no city selected, just return
    if (!cityId) return;

    // Filter districts by selected city
    const filteredDistricts = districts.filter(
      (district) => district.il_id === cityId
    );

    // Sort districts alphabetically
    filteredDistricts.sort((a, b) => a.name.localeCompare(b.name));

    // Add filtered districts to the dropdown
    filteredDistricts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district.id;
      option.textContent = district.name;
      globalDistrict.appendChild(option);
    });
  }

  /**
   * Populate district options for radius search based on selected city
   * @param {string} cityId - Selected city ID
   */
  async function populateDistrictsRadius(cityId) {
    // Wait for rate limit before updating UI
    try {
      await waitForRateLimit();
    } catch (error) {
      console.error("Error waiting for rate limit:", error);
    }

    const radiusDistrict = document.getElementById("radius-district");

    // Clear current options except the first one
    radiusDistrict.innerHTML = '<option value="">Select District</option>';

    // If no city selected, just return
    if (!cityId) return;

    // Filter districts by selected city
    const filteredDistricts = districts.filter(
      (district) => district.il_id === cityId
    );

    // Sort districts alphabetically
    filteredDistricts.sort((a, b) => a.name.localeCompare(b.name));

    // Add filtered districts to the dropdown
    filteredDistricts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district.id;
      option.textContent = district.name;
      radiusDistrict.appendChild(option);
    });

    // Enable the district dropdown
    radiusDistrict.disabled = false;
  }

  /**
   * Initialize event listeners for the application
   */
  function initEventListeners() {
    // Category filter
    categoryButtons.forEach((button) => {
      button.addEventListener("click", function () {
        // Remove active class from all buttons
        categoryButtons.forEach((btn) => btn.classList.remove("active"));
        // Add active class to clicked button
        this.classList.add("active");

        // Extract category name and convert to lowercase for API filtering
        const categoryName =
          this.querySelector(".category-name").textContent.trim();
        // Use 'all' for "All Categories", otherwise use lowercase category name
        const category =
          categoryName === "All Categories"
            ? "all"
            : categoryName.toLowerCase();

        // Update filters with category and reset to page 1
        updateFilters({
          category: category,
          page: 1,
          // Always disable radius search when filtering by category
          useRadius: false,
        });
      });
    });

    // Sorting functionality
    sortSelect.addEventListener("change", function () {
      updateFilters({
        sort: this.value,
        // Do not disable radius search when just changing sort order
      });
    });

    // Global Search Bar functionality
    globalSearchButton.addEventListener("click", function () {
      // Collect all search parameters
      const searchParams = {
        search: globalSearchInput.value.trim(),
        category: globalCategories.value,
        page: 1,
        // Always explicitly set location parameters, even when empty
        city: globalCity.value || "",
        district: globalDistrict.value || "",
        // Disable radius search when using the search bar
        useRadius: false,
      };

      // Update filters and perform search
      updateFilters(searchParams);
    });

    // Global search input - search on Enter key
    globalSearchInput.addEventListener("keyup", function (e) {
      if (e.key === "Enter") {
        globalSearchButton.click();
      }
    });

    // City select - enable/disable district select based on selection
    globalCity.addEventListener("change", function () {
      const searchBar = document.querySelector(".search-bar");

      // Reset district when city changes
      globalDistrict.value = "";

      if (this.value) {
        // Enable and show district
        globalDistrict.disabled = false;

        // Show district wrapper with animation
        document.getElementById("district-wrapper").classList.remove("hidden");

        // Update width distribution classes
        searchBar.classList.remove("city-only");
        searchBar.classList.add("city-district");

        // Populate districts for the selected city
        populateDistrictsGlobal(this.value);
      } else {
        // Disable dependent field (district already reset above)
        globalDistrict.disabled = true;

        // Hide district wrapper with animation
        document.getElementById("district-wrapper").classList.add("hidden");

        // Update width distribution classes
        searchBar.classList.add("city-only");
        searchBar.classList.remove("city-district");
      }
    });

    // District select event listener - remove map update functionality
    globalDistrict.addEventListener("change", function () {
      // REMOVED: Don't update map position when selecting district in search bar
    });

    // Radius city select - modify to use proper geocoding
    const radiusCity = document.getElementById("radius-city");
    radiusCity.addEventListener("change", function () {
      const radiusDistrict = document.getElementById("radius-district");

      // Reset district when city changes
      radiusDistrict.value = "";

      if (this.value) {
        // Enable district
        radiusDistrict.disabled = false;

        // Populate districts for the selected city
        populateDistrictsRadius(this.value);

        // Update map based on selected city
        const selectedCity = cities.find((city) => city.id === this.value);
        if (selectedCity) {
          updateMapPosition(selectedCity.name);
        }
      } else {
        radiusDistrict.disabled = true;
      }
    });

    // Radius district select - add event listener to update map
    const radiusDistrict = document.getElementById("radius-district");
    radiusDistrict.addEventListener("change", function () {
      if (this.value && radiusCity.value) {
        const selectedCity = cities.find(
          (city) => city.id === radiusCity.value
        );
        const selectedDistrict = districts.find(
          (district) => district.id === this.value
        );

        if (selectedCity && selectedDistrict) {
          updateMapPosition(selectedCity.name, selectedDistrict.name);
        }
      }
    });

    // Handle search button click
    searchRadiusBtn.addEventListener("click", function () {
      if (currentCenter) {
        // Get the current visible area and convert to geographic coordinates
        updateRadiusFromFixedCircle();

        // Update the mask circle to match the current center
        updateMaskCircle(currentCenter);

        // Clear other search fields in the UI
        globalSearchInput.value = "";
        globalCategories.value = "all";
        globalCity.value = "";
        globalDistrict.value = "";

        // Make category buttons reflect the change (reset to all)
        categoryButtons.forEach((btn) => {
          const categoryName = btn
            .querySelector(".category-name")
            .textContent.trim();
          if (categoryName === "All Categories") {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });

        // Update filters with radius search params and reset all other filters
        updateFilters({
          useRadius: true,
          radiusLat: currentCenter.lat,
          radiusLng: currentCenter.lng,
          radiusKm: currentRadius,
          page: 1, // Reset to first page
          category: "all", // Reset category
          search: "", // Clear search text
          city: "", // Clear city
          district: "", // Clear district
          sort: "newest", // Reset to default sort
        });

        // Update button state
        this.classList.add("active");
        this.textContent = "Searching with Radius";

        // Update card state
        const radiusSearchCard = document.querySelector(".radius-search-card");
        if (radiusSearchCard) {
          radiusSearchCard.classList.add("active");
        }
      } else {
        showNotification("Please set a location first", "error");
      }
    });
  }

  /**
   * Update filters and refresh the posts display
   * @param {Object} newFilters
   */
  function updateFilters(newFilters) {
    // Update the filter state
    currentFilters = { ...currentFilters, ...newFilters };

    // Add debug logs for radius search filters
    if (currentFilters.useRadius) {
      console.log("Radius search parameters:", {
        lat: currentFilters.radiusLat,
        lng: currentFilters.radiusLng,
        radiusKm: currentFilters.radiusKm,
      });
    }

    // Apply the new filters
    applyFilters();

    // Update UI to reflect filter state
    updateFilterUI();
  }

  /**
   * Standardizes location names for consistency
   * @param {string} name - The location name to standardize
   * @return {string} - The standardized name
   */
  function standardizeLocationName(name) {
    if (!name) return "";

    // Convert to title case using Turkish locale for character conversions
    return name
      .trim()
      .split(" ")
      .map((word) => {
        if (word.length === 0) return "";
        //!!!!!!!!Convert the first character to uppercase using Turkish locale
        const firstChar = word.charAt(0).toLocaleUpperCase("tr-TR");
        //!!!!!!!!!!!!!! Convert the rest of the word to lowercase using Turkish locale
        const rest = word.slice(1).toLocaleLowerCase("tr-TR");
        return firstChar + rest;
      })
      .join(" ");
  }

  /**
   * Apply current filters to posts data and update the display
   */
  function applyFilters() {
    // In a real application, this would make an API call with the filter parameters
    console.log("Applying filters:", currentFilters);

    // Convert IDs to actual names for the API call
    const apiFilters = { ...currentFilters };

    // Convert city ID to city name if needed
    if (apiFilters.city) {
      const selectedCity = cities.find((city) => city.id === apiFilters.city);
      if (selectedCity) {
        // Standardize to match database format (Istanbul without İ)
        apiFilters.city = standardizeLocationName(selectedCity.name);

        // Also log the city name we're searching with
        console.log("Searching with city name:", apiFilters.city);
      }
    }

    // Convert district ID to district name if needed
    if (apiFilters.district) {
      const selectedDistrict = districts.find(
        (district) => district.id === apiFilters.district
      );
      if (selectedDistrict) {
        // Standardize to match database format (Title case like Beylikdüzü)
        apiFilters.district = standardizeLocationName(selectedDistrict.name);

        // Also log the district name we're searching with
        console.log("Searching with district name:", apiFilters.district);
      }
    }

    // This would be replaced with actual API call
    fetchPosts(apiFilters);
  }

  /**
   * Update UI elements to reflect the current filter state
   */
  function updateFilterUI() {
    //Update category buttons
    categoryButtons.forEach((button) => {
      const category = button
        .querySelector(".category-name")
        .textContent.toLowerCase();
      if (
        (category === "all categories" && currentFilters.category === "all") ||
        category === currentFilters.category
      ) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    //Update global search inputs
    globalSearchInput.value = currentFilters.search || "";
    globalCategories.value = currentFilters.category || "all";
    globalCity.value = currentFilters.city || "";
    globalDistrict.value = currentFilters.district || "";

    //Update wrappers visibility
    const districtWrapper = document.getElementById("district-wrapper");
    const searchBar = document.querySelector(".search-bar");

    //Reset all classes for width distribution
    searchBar.classList.remove("city-only", "city-district");

    //Show/hide based on current values
    if (globalCity.value) {
      globalDistrict.disabled = false;
      districtWrapper.classList.remove("hidden");
      searchBar.classList.add("city-district");
    } else {
      globalDistrict.disabled = true;
      districtWrapper.classList.add("hidden");
      searchBar.classList.add("city-only");
    }

    //Update sort select
    sortSelect.value = currentFilters.sort;

    // Update radius search card visual state
    const radiusSearchCard = document.querySelector(".radius-search-card");
    if (radiusSearchCard) {
      if (currentFilters.useRadius) {
        radiusSearchCard.classList.add("active");
        // Update the search button text to indicate active state
        searchRadiusBtn.textContent = "Searching with Radius";
        searchRadiusBtn.classList.add("active");
      } else {
        radiusSearchCard.classList.remove("active");
        // Reset button text
        searchRadiusBtn.textContent = "Search this location";
        searchRadiusBtn.classList.remove("active");
      }
    }

    // Update pagination
    const pageNumbers = document.querySelectorAll(".page-number");
    pageNumbers.forEach((button) => {
      const page = parseInt(button.textContent);
      if (page === currentFilters.page) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    // Disable/enable pagination buttons
    prevButton.disabled = currentFilters.page === 1;
    // In a real app, you would check if there are more pages
    // nextButton.disabled = !hasMorePages;
  }

  /**
   * Fetch posts from server based on current filters
   * @param {Object} filters - The current filter state
   */
  function fetchPosts(filters) {
    // Show loading state
    postsGrid.innerHTML = '<div class="loading">Loading posts...</div>';

    // Create URLSearchParams object with properly encoded values
    const params = new URLSearchParams();

    // Store if we're doing a radius search for later use
    const isRadiusSearch =
      filters.useRadius && filters.radiusLat && filters.radiusLng;

    // Add each filter parameter, ensuring proper encoding
    Object.entries(filters).forEach(([key, value]) => {
      // For radius search, we'll handle filtering client-side
      // Skip radius parameters in the API call unless the backend explicitly supports them
      const skipRadiusParams = [
        "useRadius",
        "radiusLat",
        "radiusLng",
        "radiusKm",
      ];
      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !skipRadiusParams.includes(key)
      ) {
        params.append(key, value);
      }
    });

    // If doing radius search, we need to fetch all posts to filter client-side
    if (isRadiusSearch) {
      // Fetch more posts for client-side filtering (no limit if possible)
      params.append("limit", "1000"); // Set a high limit to get as many posts as possible

      // Log that we're doing a radius search
      console.log("Performing radius search:", {
        center: [filters.radiusLat, filters.radiusLng],
        radiusKm: filters.radiusKm,
      });
    }

    const queryString = params.toString();
    console.log("API Query string:", queryString);

    // Make actual API call with filters (query params)
    fetch("/api/posts?" + queryString)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        if (data.success) {
          // If using radius search, filter posts by distance client-side
          if (isRadiusSearch) {
            console.log(
              `Server returned ${data.data.length} posts before radius filtering`
            );

            // Filter posts that are within the radius
            const filteredPosts = filterPostsByDistance(
              data.data,
              filters.radiusLat,
              filters.radiusLng,
              filters.radiusKm
            );

            // Update results count
            data.count = filteredPosts.length;

            // Render filtered posts
            renderPosts(filteredPosts);

            // Show notification if no posts are found within radius
            if (data.data.length > 0 && filteredPosts.length === 0) {
              showNotification(
                "No posts found within the selected radius. Try zooming out to increase the search area.",
                "info"
              );
            }
          } else {
            // Render all posts as usual
            renderPosts(data.data);
          }

          // Update pagination data if provided
          if (data.pagination) {
            updatePagination(data.pagination);
          } else {
            // Basic pagination data if not provided by API
            updatePagination({
              currentPage: currentFilters.page,
              totalPages: Math.max(1, Math.ceil(data.count / 10)),
              totalItems: data.count,
            });
          }
        } else {
          throw new Error("Failed to fetch posts");
        }
      })
      .catch((error) => {
        console.error("Error fetching posts:", error);
        postsGrid.innerHTML =
          '<div class="error">Error loading posts. Please try again.</div>';

        // Set up empty pagination for error state
        updatePagination({
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
        });
      });
  }

  /**
   * Filter posts by distance from center point
   * @param {Array} posts - Array of posts to filter
   * @param {number} centerLat - Latitude of center point
   * @param {number} centerLng - Longitude of center point
   * @param {number} radiusKm - Radius in kilometers
   * @returns {Array} - Filtered posts within radius
   */
  function filterPostsByDistance(posts, centerLat, centerLng, radiusKm) {
    console.log(
      `Filtering ${posts.length} posts by distance. Center: ${centerLat}, ${centerLng}, Radius: ${radiusKm}km`
    );

    // Log posts structure for debugging
    if (posts.length > 0) {
      console.log(
        "First post location structure:",
        JSON.stringify(posts[0].location)
      );
    }

    // Track how many posts have valid location data
    let validLocationCount = 0;
    let postsInRadius = 0;

    const filteredPosts = posts.filter((post) => {
      // Check if post has valid location data
      if (!post.location) {
        console.log(`Post ${post._id || "unknown"} has no location property`);
        return false;
      }

      let lat, lng;

      // Extract coordinates based on post location structure
      if (post.location.coordinates) {
        // Handle different coordinate formats
        if (Array.isArray(post.location.coordinates)) {
          // GeoJSON format: [longitude, latitude]
          lng = post.location.coordinates[0];
          lat = post.location.coordinates[1];
        } else if (typeof post.location.coordinates === "object") {
          // Object with lat/lng or latitude/longitude
          if (
            post.location.coordinates.latitude !== undefined &&
            post.location.coordinates.longitude !== undefined
          ) {
            lat = post.location.coordinates.latitude;
            lng = post.location.coordinates.longitude;
          } else if (
            post.location.coordinates.lat !== undefined &&
            post.location.coordinates.lng !== undefined
          ) {
            lat = post.location.coordinates.lat;
            lng = post.location.coordinates.lng;
          }
        }
      } else if (
        post.location.lat !== undefined &&
        post.location.lng !== undefined
      ) {
        // Direct lat/lng format in location object
        lat = post.location.lat;
        lng = post.location.lng;
      } else if (
        post.location.latitude !== undefined &&
        post.location.longitude !== undefined
      ) {
        // Named coordinate properties in location object
        lat = post.location.latitude;
        lng = post.location.longitude;
      } else if (typeof post.location === "string") {
        // Location might be stored as a string, which we can't use for distance calculation
        console.log(
          `Post ${post._id || "unknown"} has location as string: ${
            post.location
          }`
        );
        return false;
      }

      // Skip if coordinates are not valid numbers
      if (isNaN(lat) || isNaN(lng) || lat === undefined || lng === undefined) {
        console.log(
          `Post has missing or invalid coordinates. Checking city match instead.`
        );

        // Alternative: use city/district matching as fallback when coordinates are not available
        // If the post's city matches the center's city (e.g., both in Istanbul), include it
        // This is an approximation and not as accurate as coordinate-based distance
        if (post.location.city) {
          // Get city name for center coordinates through reverse geocoding
          // This requires implementing a city matching logic which is beyond scope here
          // For demo purposes, just include posts from major cities in the results
          const majorCities = ["Istanbul", "Ankara", "Izmir", "Bursa"];
          if (majorCities.includes(post.location.city)) {
            console.log(
              `Including post in ${post.location.city} based on city matching`
            );
            validLocationCount++;
            postsInRadius++;
            return true;
          }
        }

        return false;
      }

      validLocationCount++;

      // Calculate distance between post and center
      const distance = calculateDistance(centerLat, centerLng, lat, lng);

      // Add distance to post object for potential sorting
      post.distance = distance;

      // Include post if it's within radius
      const isInRadius = distance <= radiusKm;
      if (isInRadius) {
        postsInRadius++;
      }
      return isInRadius;
    });

    console.log(
      `Posts with valid locations: ${validLocationCount}/${posts.length}`
    );
    console.log(`Posts within ${radiusKm}km radius: ${postsInRadius}`);

    return filteredPosts;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} - Distance in kilometers
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    // Earth's radius in kilometers
    const R = 6371;

    // Convert degrees to radians
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    // Haversine formula
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Render posts to the posts grid
   * @param {Array} posts - Array of post objects
   */
  function renderPosts(posts) {
    if (!posts || posts.length === 0) {
      postsGrid.innerHTML =
        '<div class="no-results">No posts found matching your criteria.</div>';
      resultsCount.textContent = "0";
      return;
    }

    //Update results count
    resultsCount.textContent = posts.length;

    //Clear posts grid
    postsGrid.innerHTML = "";

    // Render each post
    posts.forEach((post) => {
      const postElement = document.createElement("div");
      postElement.className = "post-card card";
      postElement.addEventListener("click", function () {
        window.location.href = `/posts/${post._id}`;
      });

      postElement.innerHTML = `
        <div class="post-image">
          ${
            post.images && post.images.length > 0
              ? `<img src="${post.images[0].url}" alt="${post.title}">`
              : `<img src="https://via.placeholder.com/300x200" alt="No image available">`
          }
        </div>
        <div class="post-details">
          <h3 class="post-title">${post.title}</h3>
          <div class="post-meta">
            <span class="post-location">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              ${post.location.city}, ${post.location.district}
            </span>
            <span class="post-date">Posted: ${new Date(
              post.createdAt
            ).toLocaleDateString("tr-TR", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}</span>
          </div>
          <div class="post-tags">
            <span class="tag">${post.category}</span>
            <span class="tag">${post.condition}</span>
          </div>
        </div>
      `;

      postsGrid.appendChild(postElement);
    });
  }

  /**
   * Update pagination UI based on pagination data
   * @param {Object} pagination - Pagination information
   */
  function updatePagination(pagination) {
    const paginationNumbers = document.querySelector(".pagination-numbers");
    paginationNumbers.innerHTML = ""; // Clear existing buttons

    const { currentPage, totalPages } = pagination;

    // Determine range of pages to show
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // Adjust start page if we're near the end
    if (endPage - startPage < 4 && startPage > 1) {
      startPage = Math.max(1, endPage - 4);
    }

    // Add first page button if not in range
    if (startPage > 1) {
      const firstPageBtn = createPageButton(1, currentPage);
      paginationNumbers.appendChild(firstPageBtn);

      // Add ellipsis if there's a gap
      if (startPage > 2) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.textContent = "...";
        paginationNumbers.appendChild(ellipsis);
      }
    }

    // Create page number buttons
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = createPageButton(i, currentPage);
      paginationNumbers.appendChild(pageBtn);
    }

    // Add last page button if not in range
    if (endPage < totalPages) {
      // Add ellipsis if there's a gap
      if (endPage < totalPages - 1) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.textContent = "...";
        paginationNumbers.appendChild(ellipsis);
      }

      const lastPageBtn = createPageButton(totalPages, currentPage);
      paginationNumbers.appendChild(lastPageBtn);
    }

    // Enable/disable previous and next buttons
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;

    // Update next/prev button handlers
    prevButton.onclick = function () {
      if (!this.disabled) {
        updateFilters({ page: currentPage - 1 });
      }
    };

    nextButton.onclick = function () {
      if (!this.disabled) {
        updateFilters({ page: currentPage + 1 });
      }
    };
  }

  /**
   * Create a page number button
   * @param {Number} pageNum - The page number
   * @param {Number} currentPage - The current active page
   * @returns {HTMLElement} The page button element
   */
  function createPageButton(pageNum, currentPage) {
    const button = document.createElement("button");
    button.className =
      "page-number" + (pageNum === currentPage ? " active" : "");
    button.textContent = pageNum;
    button.addEventListener("click", function () {
      updateFilters({ page: pageNum });
    });
    return button;
  }

  // Set up radius controls (simplified - no slider)
  function setupRadiusControls() {
    // Handle "Use My Location" button
    useMyLocationBtn.addEventListener("click", function () {
      // Show loading state
      this.disabled = true;
      this.innerHTML = '<span class="loading-spinner"></span> Locating...';

      // Try to get user's location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          // Success callback
          function (position) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            // Center map on user location at a closer zoom level (14 instead of 12)
            map.setView([userLat, userLng], 14);

            // Update radius calculation and center
            updateRadiusFromFixedCircle();

            // Update the mask circle
            updateMaskCircle([userLat, userLng]);

            // Reset button
            useMyLocationBtn.disabled = false;
            useMyLocationBtn.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></svg> Use My Location';
          },
          // Error callback
          function (error) {
            console.error("Error getting location:", error);

            // Show error notification
            showNotification(
              "Unable to access your location. Please make sure location services are enabled.",
              "error"
            );

            // Reset button
            useMyLocationBtn.disabled = false;
            useMyLocationBtn.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></svg> Use My Location';
          },
          // Options
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      } else {
        // Geolocation not supported
        showNotification(
          "Geolocation is not supported by your browser.",
          "error"
        );

        // Reset button
        useMyLocationBtn.disabled = false;
        useMyLocationBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" /></svg> Use My Location';
      }
    });

    // Handle search button click
    searchRadiusBtn.addEventListener("click", function () {
      if (currentCenter) {
        // Get the current visible area and convert to geographic coordinates
        updateRadiusFromFixedCircle();

        // Update the mask circle to match the current center
        updateMaskCircle(currentCenter);

        // Clear other search fields in the UI
        globalSearchInput.value = "";
        globalCategories.value = "all";
        globalCity.value = "";
        globalDistrict.value = "";

        // Make category buttons reflect the change (reset to all)
        categoryButtons.forEach((btn) => {
          const categoryName = btn
            .querySelector(".category-name")
            .textContent.trim();
          if (categoryName === "All Categories") {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });

        // Update filters with radius search params and reset all other filters
        updateFilters({
          useRadius: true,
          radiusLat: currentCenter.lat,
          radiusLng: currentCenter.lng,
          radiusKm: currentRadius,
          page: 1, // Reset to first page
          category: "all", // Reset category
          search: "", // Clear search text
          city: "", // Clear city
          district: "", // Clear district
          sort: "newest", // Reset to default sort
        });

        // Update button state
        this.classList.add("active");
        this.textContent = "Searching with Radius";

        // Update card state
        const radiusSearchCard = document.querySelector(".radius-search-card");
        if (radiusSearchCard) {
          radiusSearchCard.classList.add("active");
        }
      } else {
        showNotification("Please set a location first", "error");
      }
    });
  }

  /**
   * Forward geocode an address to get coordinates
   * @param {string} address - The address to geocode
   * @returns {Promise<Object>} - The geocoding result
   */
  async function forwardGeocode(address) {
    try {
      await waitForRateLimit();
      const encodedAddress = encodeURIComponent(address);
      const url = `https://geocode.maps.co/search?q=${encodedAddress}&api_key=${apiKey}`;
      console.log(`Geocoding address: ${address}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error in forwardGeocode:", error);
      return { error: { message: "Failed to geocode address" } };
    }
  }

  /**
   * Update map position based on city and district
   * @param {string} cityName - City name
   * @param {string} districtName - District name (optional)
   */
  async function updateMapPosition(cityName, districtName) {
    if (!cityName) return;

    // Format the address string
    let address = standardizeLocationName(cityName);
    if (districtName) {
      address += `, ${standardizeLocationName(districtName)}`;
    }
    address += ", Turkey"; // Add country for better results

    try {
      const geocodeResult = await forwardGeocode(address);

      if (geocodeResult && geocodeResult.length > 0 && !geocodeResult.error) {
        // Get the first result
        const location = geocodeResult[0];

        if (location.lat && location.lon) {
          const lat = parseFloat(location.lat);
          const lon = parseFloat(location.lon);

          // Update map position
          map.setView([lat, lon], districtName ? 13 : 11);

          // Update center marker if it exists
          if (centerMarker) {
            centerMarker.setLatLng([lat, lon]);
          }

          // Update radius circle and mask if they exist
          if (radiusCircle) {
            radiusCircle.setLatLng([lat, lon]);
            updateMaskCircle([lat, lon]);
          }

          // Update location info display
          updateLocationInfo({ lat, lng: lon });

          // Update radius calculation based on new position
          updateRadiusFromFixedCircle();
        }
      }
    } catch (error) {
      console.error("Error updating map position:", error);
    }
  }

  // Initialize the page
  async function init() {
    // Load location data first
    await loadLocationData();

    // Initialize the radius map
    initRadiusMap();

    // Then initialize event listeners
    initEventListeners();

    // Hide district section on initial load
    document.getElementById("district-wrapper").classList.add("hidden");

    //Set initial class for width distribution
    document.querySelector(".search-bar").classList.add("city-only");

    //Initial load of posts
    applyFilters();
  }

  //Start the application
  init();

  // Add the new function to update city/district based on map position
  /**
   * Update city and district dropdowns based on the map's current position
   * @param {Object} latlng - The current map center coordinates {lat, lng}
   */
  async function updateCityDistrictFromMap(latlng) {
    if (!latlng || !cities || !districts) return;

    try {
      // Wait for rate limit before making geocoding request
      await waitForRateLimit();

      // Get location data from coordinates - no console logs to keep it clean
      const locationData = await reverseGeocode(latlng.lat, latlng.lng);

      if (!locationData || !locationData.address) return;

      // Extract city name from multiple possible fields (in order of preference)
      const cityName =
        locationData.address.city ||
        locationData.address.town ||
        locationData.address.county ||
        locationData.address.state;

      if (!cityName) return;

      // Standardize the city name for comparison
      const standardizedCityName = standardizeLocationName(cityName);

      // Find matching city using both exact and partial matching
      let matchedCity = cities.find(
        (city) => standardizeLocationName(city.name) === standardizedCityName
      );

      // Try partial matching if exact match failed
      if (!matchedCity) {
        matchedCity = cities.find((city) => {
          const standardizedName = standardizeLocationName(city.name);
          return (
            standardizedName.includes(standardizedCityName) ||
            standardizedCityName.includes(standardizedName)
          );
        });
      }

      if (!matchedCity) return;

      // Wait for rate limit before updating UI
      await waitForRateLimit();

      // Extract district name from multiple possible fields
      const districtName =
        locationData.address.suburb ||
        locationData.address.neighbourhood ||
        locationData.address.district ||
        locationData.address.quarter;

      // Get current selections to check if anything changed
      const radiusCity = document.getElementById("radius-city");
      const radiusDistrict = document.getElementById("radius-district");
      const oldCityValue = radiusCity.value;

      // Update city dropdown if needed
      radiusCity.value = matchedCity.id;

      // If city changed or district dropdown is disabled, update districts
      if (oldCityValue !== matchedCity.id || radiusDistrict.disabled) {
        // First enable the district dropdown
        radiusDistrict.disabled = false;

        // Then populate it
        await populateDistrictsRadius(matchedCity.id);

        // Give browser time to update DOM
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Now try to find and select matching district
      if (districtName) {
        const standardizedDistrictName = standardizeLocationName(districtName);

        // Wait briefly to ensure district options are fully populated
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Find district with matching city ID and name
        let matchedDistrict = districts.find(
          (district) =>
            district.il_id === matchedCity.id &&
            standardizeLocationName(district.name) === standardizedDistrictName
        );

        // Try partial match if exact match failed
        if (!matchedDistrict) {
          matchedDistrict = districts.find((district) => {
            if (district.il_id !== matchedCity.id) return false;

            const stdName = standardizeLocationName(district.name);
            return (
              stdName.includes(standardizedDistrictName) ||
              standardizedDistrictName.includes(stdName)
            );
          });
        }

        // Update district dropdown if we found a match
        if (matchedDistrict) {
          radiusDistrict.value = matchedDistrict.id;
        }
      }
    } catch (error) {
      console.error("Error updating city/district from map:", error);
    }
  }
});

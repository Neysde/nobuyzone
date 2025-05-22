// main.js - Interactive map for the main page showing post count by city
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize map centered on Turkey with appropriate zoom
  const map = L.map("map", {
    center: [39.0, 35.0],
    zoom: 5,
    zoomControl: true,
    scrollWheelZoom: false,
    maxBounds: [
      [33.0, 25.0], // Southwest bounds
      [43.0, 45.0], // Northeast bounds
    ],
    minZoom: 5,
  });

  // Add the OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  // Custom tooltip class for city hover info
  const createTooltipContent = (cityName, postCount) => {
    return `
      <div class="city-tooltip">
        <span class="post-count">${postCount}</span> posts were listed in 
        <span class="city-name">${cityName}</span>
        <div class="tooltip-hint">To see these posts, click into ${cityName}</div>
      </div>
    `;
  };

  // Fetch post counts by city
  const fetchPostCountsByCity = async () => {
    try {
      const response = await fetch("/api/posts/count-by-city");
      if (!response.ok) {
        throw new Error("Failed to fetch post counts");
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching post counts:", error);
      return { data: {} }; // Return empty object as fallback
    }
  };

  // Load city data and post counts
  try {
    // Fetch post counts first
    const postCountsData = await fetchPostCountsByCity();
    const postCounts = postCountsData.data || {};

    // Log the post counts for debugging
    console.log("Client: Received post counts by city from API:", postCounts);

    // Then load GeoJSON file
    const response = await fetch("/backend/json/tr-cities.geojson");
    if (!response.ok) {
      throw new Error(
        `Failed to load GeoJSON: ${response.status} ${response.statusText}`
      );
    }
    const geoData = await response.json();

    // Process GeoJSON data with improved styling
    const geoLayer = L.geoJSON(geoData, {
      onEachFeature: function (feature, layer) {
        const cityNameFromGeoJSON = feature.properties.name; // e.g., "İstanbul"
        // Normalize the city name from GeoJSON to match keys from API (lowercase, trimmed)
        // Using 'tr-TR' locale for proper Turkish character lowercasing (e.g., İ -> i)
        const normalizedCityKey = cityNameFromGeoJSON
          .toLowerCase("tr-TR")
          .trim();

        const postCount = postCounts[normalizedCityKey] || 0;

        // Log individual city matching for debugging
        if (
          !postCounts.hasOwnProperty(normalizedCityKey) &&
          Object.keys(postCounts).length > 0
        ) {
          console.warn(
            `No match for GeoJSON city: '${cityNameFromGeoJSON}' (normalized: '${normalizedCityKey}'). Available API keys:`,
            Object.keys(postCounts)
          );
        } else if (postCounts.hasOwnProperty(normalizedCityKey)) {
          // console.log(`Match found for GeoJSON city: '${cityNameFromGeoJSON}' (normalized: '${normalizedCityKey}'), Count: ${postCount}`);
        }

        // Set tooltip
        layer.bindTooltip(
          createTooltipContent(cityNameFromGeoJSON, postCount),
          {
            permanent: false,
            direction: "top",
            className: "custom-tooltip",
          }
        );

        // Handle click event
        layer.on("click", () => {
          window.location.href = `/find-posts?city=${encodeURIComponent(
            cityNameFromGeoJSON
          )}`;
        });

        // Add hover event handlers for better UX
        layer.on("mouseover", function () {
          this.setStyle({
            weight: 3,
            fillOpacity: 0.9,
          });
        });

        layer.on("mouseout", function () {
          geoLayer.resetStyle(this);
        });
      },
      style: function (feature) {
        const cityNameFromGeoJSON = feature.properties.name;
        // Normalize for style lookup as well (lowercase, trimmed)
        const normalizedCityKey = cityNameFromGeoJSON
          .toLowerCase("tr-TR")
          .trim();
        const postCount = postCounts[normalizedCityKey] || 0;

        // Enhanced styling for better visibility
        return {
          color: "#3388ff", // Border color
          weight: 2, // Border weight
          fillColor: postCount > 0 ? "#4ade80" : "#66ccff", // Fill color based on post count
          fillOpacity: 0.7, // Fill opacity
          opacity: 1, // Border opacity
        };
      },
    }).addTo(map);

    // Ensure map shows all features
    map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
  } catch (error) {
    console.error("Error loading map data:", error);

    // Display error message on the map
    const errorDiv = document.createElement("div");
    errorDiv.className = "map-error";
    errorDiv.innerHTML = `
      <p>Failed to load map data. Please try refreshing the page.</p>
      <p>Error: ${error.message}</p>
    `;

    document.querySelector(".map-container").appendChild(errorDiv);
  }
});

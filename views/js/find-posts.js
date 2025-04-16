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
  const globalNeighborhood = document.getElementById("global-neighborhood");
  const globalRadius = document.getElementById("global-radius");
  const globalSearchButton = document.getElementById("global-search-button");

  // Data variables for location 
  let cities = [];
  let districts = [];

  // State variables
  let currentFilters = {
    category: "all",
    search: "",
    city: "",
    district: "",
    neighborhood: "",
    sort: "newest",
    page: 1,
  };

  // Load city and district data
  async function loadLocationData() {
    try {
      console.log("Fetching location data...");
      const [ilResponse, ilceResponse] = await Promise.all([
        fetch("/backend/json/il.json"),
        fetch("/backend/json/ilce.json")
      ]);

      if (!ilResponse.ok || !ilceResponse.ok) {
        console.error("Failed to load location data. Status codes:", ilResponse.status, ilceResponse.status);
        throw new Error("Failed to load location data");
      }

      const ilJson = await ilResponse.json();
      const ilceJson = await ilceResponse.json();

      // Extract data arrays from JSON
      cities = ilJson.find(item => item.name === "il").data; //finds the object which contains "il" in its name property 
      //and after that it accesses the data property of that object by .data, which is an array of city objects.
      districts = ilceJson.find(item => item.name === "ilce").data;

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
    
    //Add cities to dropdown
    cities.forEach(city => {
      //Add to global search
      const globalOption = document.createElement("option");
      globalOption.value = city.id;
      globalOption.textContent = city.name;
      globalCity.appendChild(globalOption);
    });
  }

  //event listeners
  function initEventListeners() {
    //Category filter
    categoryButtons.forEach((button) => {
      button.addEventListener("click", function () {
        //Remove active class from all buttons
        categoryButtons.forEach((btn) => btn.classList.remove("active"));
        //Add active class to clicked button
        this.classList.add("active");

        //Extract category name and convert to lowercase for API filtering !!!GETS OTHER CATEGORIES FROM EJS FILE AND EJS DOES THIS DYNAMICALLY
        const categoryName =
          this.querySelector(".category-name").textContent.trim();
        //Use 'all' for "All Categories", otherwise use lowercase category name
        const category =
          categoryName === "All Categories"
            ? "all"
            : categoryName.toLowerCase();

        //Another func for updating filters and refreshing posts
        updateFilters({ category: category, page: 1 });
      });
    });

    //Sorting functionality
    sortSelect.addEventListener("change", function () {
      updateFilters({ sort: this.value });
    });

    // Pagination events are now handled by the updatePagination function

    //Global Search Bar functionality
    globalSearchButton.addEventListener("click", function () {
      //Collect all search parameters
      const searchParams = {
        search: globalSearchInput.value.trim(),
        category: globalCategories.value,
        page: 1,
        //Always explicitly set location parameters, even when empty
        city: globalCity.value || "",
        district: globalDistrict.value || "",
        neighborhood: globalNeighborhood.value || "",
      };

      // dd radius if location is selected and radius is not "whole area"
      if (globalCity.value && globalRadius.value !== "0") {
        searchParams.radius = globalRadius.value;
      }

      //Update filters and perform search
      updateFilters(searchParams);
    });

    //Global search input - search on Enter key
    globalSearchInput.addEventListener("keyup", function (e) {
      if (e.key === "Enter") {
        globalSearchButton.click();
      }
    });

    //City select - enable/disable district select based on selection
    globalCity.addEventListener("change", function () {
      const searchBar = document.querySelector(".search-bar");

      if (this.value) {
        //Enable and show district and radius
        globalDistrict.disabled = false;
        globalRadius.disabled = false;

        //Show district wrapper with animation
        document.getElementById("district-wrapper").classList.remove("hidden");

        //Show radius wrapper with animation
        document.getElementById("radius-wrapper").classList.remove("hidden");

        //Update width distribution classes
        searchBar.classList.remove("city-only");
        searchBar.classList.add("city-district-radius");

        //Populate districts for the selected city
        populateDistrictsGlobal(this.value);
      } else {
        // Disable and reset dependent fields
        globalDistrict.disabled = true;
        globalDistrict.value = "";
        globalNeighborhood.disabled = true;
        globalNeighborhood.value = "";
        globalRadius.disabled = true;
        globalRadius.value = "0"; // Reset radius to default

        //Hide district wrapper with animation
        document.getElementById("district-wrapper").classList.add("hidden");

        //Hide neighborhood wrapper with animation
        document.getElementById("neighborhood-wrapper").classList.add("hidden");

        //Hide radius wrapper with animation
        document.getElementById("radius-wrapper").classList.add("hidden");

        //Update width distribution classes
        searchBar.classList.add("city-only");
        searchBar.classList.remove(
          "city-radius",
          "city-district-radius",
          "city-district-neighborhood-radius"
        );
      }
    });

    //District select - enable/disable neighborhood select based on selection
    globalDistrict.addEventListener("change", function () {
      const searchBar = document.querySelector(".search-bar");

      if (this.value) {
        globalNeighborhood.disabled = false;

        //Show neighborhood wrapper with animation
        document
          .getElementById("neighborhood-wrapper")
          .classList.remove("hidden");

        //Update width distribution classes
        searchBar.classList.remove("city-district-radius");
        searchBar.classList.add("city-district-neighborhood-radius");

        //Populate neighborhoods for the selected district
        populateNeighborhoodsGlobal(this.value);
      } else {
        // Disable and reset dependent field
        globalNeighborhood.disabled = true;
        globalNeighborhood.value = "";

        //Hide neighborhood wrapper with animation
        document.getElementById("neighborhood-wrapper").classList.add("hidden");

        //Update width distribution classes
        searchBar.classList.remove("city-district-neighborhood-radius");
        searchBar.classList.add("city-district-radius");
      }
    });
  }

  /**
   * Update filters and refresh the posts display
   * newFilters should be an object
   * @param {Object} newFilters
   */
  function updateFilters(newFilters) {
    //Update the filter state
    currentFilters = { ...currentFilters, ...newFilters }; //It creates a new object.
    //It copies all properties from currentFilters into this new object.
    //It then copies all properties from newFilters into the same new object.
    //If there are any properties in newFilters that already exist in currentFilters, the values from newFilters will overwrite the existing values.

    //Apply the new filters in previous line on top it combined filters obj. so current filter has been updated
    applyFilters();

    //Update UI to reflect filter state
    updateFilterUI();
  }

  /**
   * Standardize Turkish location names for consistent searching
   * @param {string} name - The location name to standardize
   * @returns {string} - Standardized name
   */
  function standardizeLocationName(name) {
    if (!name) return name;
    
    // Replace İ with I and convert to title case
    let result = name.replace(/İ/g, 'I').replace(/ı/g, 'i');
    
    // Convert to title case (first letter uppercase, rest lowercase)
    result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
    
    return result;
  }

  /**
   * Apply current filters to posts data and update the display
   */
  function applyFilters() {
    //In a real application, this would make an API call with the filter parameters
    //For demo, we'll just log the current filter state !!!!THIS CONSOLE.LOG WILL BE REMOVED LATER
    console.log("Applying filters:", currentFilters);

    //Convert IDs to actual names for the API call
    const apiFilters = { ...currentFilters };
    
    // Convert city ID to city name if needed
    if (apiFilters.city) {
      const selectedCity = cities.find(city => city.id === apiFilters.city);
      if (selectedCity) {
        // Standardize to match database format (Istanbul without İ)
        apiFilters.city = standardizeLocationName(selectedCity.name);
        
        // Also log the city name we're searching with
        console.log("Searching with city name:", apiFilters.city);
      }
    }
    
    // Convert district ID to district name if needed
    if (apiFilters.district) {
      const selectedDistrict = districts.find(district => district.id === apiFilters.district);
      if (selectedDistrict) {
        // Standardize to match database format (Title case like Beylikdüzü)
        apiFilters.district = standardizeLocationName(selectedDistrict.name);
        
        // Also log the district name we're searching with
        console.log("Searching with district name:", apiFilters.district);
      }
    }
    
    // Standardize neighborhood name if needed
    if (apiFilters.neighborhood) {
      apiFilters.neighborhood = standardizeLocationName(apiFilters.neighborhood);
    }

    //This would be replaced with actual API call
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
    globalNeighborhood.value = currentFilters.neighborhood || "";

    //Update wrappers visibility
    const districtWrapper = document.getElementById("district-wrapper");
    const neighborhoodWrapper = document.getElementById("neighborhood-wrapper");
    const radiusWrapper = document.getElementById("radius-wrapper");
    const searchBar = document.querySelector(".search-bar");

    //Reset all classes for width distribution
    searchBar.classList.remove(
      "city-only",
      "city-radius",
      "city-district-radius",
      "city-district-neighborhood-radius"
    );

    //Show/hide based on current values
    if (globalCity.value) {
      globalDistrict.disabled = false;
      globalRadius.disabled = false;
      districtWrapper.classList.remove("hidden");
      radiusWrapper.classList.remove("hidden");

      if (globalDistrict.value) {
        globalNeighborhood.disabled = false;
        neighborhoodWrapper.classList.remove("hidden");
        searchBar.classList.add("city-district-neighborhood-radius");
      } else {
        globalNeighborhood.disabled = true;
        neighborhoodWrapper.classList.add("hidden");
        searchBar.classList.add("city-district-radius");
      }
    } else {
      globalDistrict.disabled = true;
      globalNeighborhood.disabled = true;
      globalRadius.disabled = true;
      districtWrapper.classList.add("hidden");
      neighborhoodWrapper.classList.add("hidden");
      radiusWrapper.classList.add("hidden");
      searchBar.classList.add("city-only");
    }

    //Update sort select
    sortSelect.value = currentFilters.sort;

    // Update pagination
    const pageNumbers = document.querySelectorAll('.page-number');
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
    
    // Add each filter parameter, ensuring proper encoding
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        // For city, district, and neighborhood, ensure we're sending the value directly
        // This avoids any complications with how the data is stored vs how it's displayed
        params.append(key, value);
      }
    });

    const queryString = params.toString();
    console.log("Query string:", queryString);

    //Make actual API call with filters (query params)
    fetch("/api/posts?" + queryString)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        if (data.success) {
          renderPosts(data.data);

          //Update pagination data if provided
          if (data.pagination) {
            updatePagination(data.pagination);
          } else {
            //Basic pagination data if not provided by API
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
          <p class="post-description">${post.description}</p>
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

  /**
   * Populate district options for the global search based on selected city
   * @param {string} cityId - Selected city ID
   */
  function populateDistrictsGlobal(cityId) {
    // Clear current options except the first one
    globalDistrict.innerHTML = '<option value="">Select District</option>';

    // If no city selected, just return
    if (!cityId) return;

    // Filter districts by selected city
    const filteredDistricts = districts.filter(district => district.il_id === cityId);
    
    // Sort districts alphabetically
    filteredDistricts.sort((a, b) => a.name.localeCompare(b.name));

    // Add filtered districts to the dropdown
    filteredDistricts.forEach(district => {
      const option = document.createElement("option");
      option.value = district.id;
      option.textContent = district.name;
      globalDistrict.appendChild(option);
    });
  }

  /**
   * Populate neighborhood options for the global search based on selected district
   * @param {string} districtId - Selected district ID
   */
  async function populateNeighborhoodsGlobal(districtId) {
    //Clear current options
    globalNeighborhood.innerHTML = '<option value="">Select Neighborhood</option>';
    
    // If no district selected, just return
    if (!districtId) return;
    
    //Find the district and its corresponding city to use in the API call
    const selectedDistrict = districts.find(d => d.id === districtId);
    if (!selectedDistrict) return;
    
    const districtName = selectedDistrict.name;
    
    // Get city name from the city ID stored in the district object
    const cityId = selectedDistrict.il_id;
    const selectedCity = cities.find(c => c.id === cityId);
    if (!selectedCity) return;
    
    const cityName = selectedCity.name;
    
    try {
      // Use our proxy endpoint which avoids CORS issues
      //encodeURIComponent helps to convert these characters that are not allowed in urls(for ex: spaces) into a format that can be safely included in a URL.
      const neighborhoodResponse = await fetch(`/api/mahalleler?iladi=${encodeURIComponent(cityName)}&ilce=${encodeURIComponent(districtName)}`);
      
      if (!neighborhoodResponse.ok) {
        console.error("Failed to fetch neighborhoods for global search. Status:", neighborhoodResponse.status);
        return;
      }
      
      const neighborhoodData = await neighborhoodResponse.json();
      
      if (!Array.isArray(neighborhoodData) || neighborhoodData.length === 0) {
        console.warn("No neighborhoods found for global search or data is not an array:", neighborhoodData);
        return;
      }
      
      // Sort neighborhoods alphabetically by mahalleAdi
      neighborhoodData.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi));
      
      // Add neighborhoods from API response to dropdown
      neighborhoodData.forEach(neighborhood => {
        const option = document.createElement("option");
        option.value = neighborhood.mahalleAdi.toLowerCase();
        option.textContent = neighborhood.mahalleAdi;
        globalNeighborhood.appendChild(option);
      });
    } catch (error) {
      console.error("Error fetching neighborhoods for global search:", error);
    }
  }

  // Initialize the page
  async function init() {
    // Load location data first
    await loadLocationData();
    
    // Then initialize event listeners
    initEventListeners();

    // Hide district, neighborhood, and radius sections on initial load
    document.getElementById("district-wrapper").classList.add("hidden");
    document.getElementById("neighborhood-wrapper").classList.add("hidden");
    document.getElementById("radius-wrapper").classList.add("hidden");

    //Set initial class for width distribution
    document.querySelector(".search-bar").classList.add("city-only");

    //Initial load of posts
    applyFilters();
  }

  //Start the application
  init();
});

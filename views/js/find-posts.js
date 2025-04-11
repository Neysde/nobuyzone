/**
 * Find Posts Page JavaScript
 * Handles filtering, sorting, and pagination for the barter items listing page
 */

document.addEventListener("DOMContentLoaded", function () {
  // Cache DOM elements
  const categoryButtons = document.querySelectorAll(".category-button");
  const cityFilter = document.getElementById("city-filter");
  const districtFilter = document.getElementById("district-filter");
  const neighborhoodFilter = document.getElementById("neighborhood-filter");
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

    //Location filters
    cityFilter.addEventListener("change", function () {
      const cityValue = this.value || ""; // Ensure empty string if no value
      updateFilters({
        city: cityValue,
        //Reset dependent filters when parent changes
        district: "",
        neighborhood: "",
        page: 1,
      });

      //In a real application, you would now fetch districts for the selected city
      //and update the district select options
      updateDistrictOptions(cityValue);
    });

    districtFilter.addEventListener("change", function () {
      const districtValue = this.value || "";
      updateFilters({
        district: districtValue,
        //Reset dependent filters when parent changes
        neighborhood: "",
        page: 1,
      });

      updateNeighborhoodOptions(districtValue);
    });

    neighborhoodFilter.addEventListener("change", function () {
      const neighborhoodValue = this.value || "";
      updateFilters({
        neighborhood: neighborhoodValue,
        page: 1,
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
   * Apply current filters to posts data and update the display
   */
  function applyFilters() {
    //In a real application, this would make an API call with the filter parameters
    //For demo, we'll just log the current filter state !!!!THIS CONSOLE.LOG WILL BE REMOVED LATER
    console.log("Applying filters:", currentFilters);

    //This would be replaced with actual API call
    fetchPosts(currentFilters);
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

    //Update location selects
    cityFilter.value = currentFilters.city;
    districtFilter.value = currentFilters.district;
    neighborhoodFilter.value = currentFilters.neighborhood;

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

    //Make actual API call with filters (query params)
    fetch("/api/posts?" + new URLSearchParams(filters)) //It turns an obj to query params
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
   * Update district options based on selected city
   * @param {string} city - Selected city value
   */

  //CHECK FOR THIS FUNC LATER MAYBE IT IS NOT NECESSARY
  function updateDistrictOptions(city) {
    districtFilter.innerHTML = '<option value="">All Districts</option>';

    if (city === "istanbul") {
      const districts = [
        "Şişli",
        "Kadıköy",
        "Beşiktaş",
        "Bayrampaşa",
        "Beylikdüzü",
      ];
      districts.forEach((district) => {
        const option = document.createElement("option");
        option.value = district.toLowerCase();
        option.textContent = district;
        districtFilter.appendChild(option);
      });
    } else if (city === "ankara") {
      const districts = ["Çankaya", "Keçiören", "Mamak"];
      districts.forEach((district) => {
        const option = document.createElement("option");
        option.value = district.toLowerCase();
        option.textContent = district;
        districtFilter.appendChild(option);
      });
    }

    // Reset neighborhood filter since district changed
    neighborhoodFilter.innerHTML =
      '<option value="">All Neighborhoods</option>';
  }
  /**
   * Update neighborhood options based on selected district
   * @param {string} district - Selected district value
   */
  function updateNeighborhoodOptions(district) {
    // In a real application, you would fetch neighborhoods for the selected district
    // For demo, we'll just simulate different options

    neighborhoodFilter.innerHTML =
      '<option value="">All Neighborhoods</option>';

    if (district === "sisli") {
      const neighborhoods = ["Mecidiyeköy", "Esentepe", "Fulya"];
      neighborhoods.forEach((neighborhood) => {
        const option = document.createElement("option");
        option.value = neighborhood.toLowerCase();
        option.textContent = neighborhood;
        neighborhoodFilter.appendChild(option);
      });
    } else if (district === "kadikoy") {
      const neighborhoods = ["Moda", "Caferağa", "Fenerbahçe"];
      neighborhoods.forEach((neighborhood) => {
        const option = document.createElement("option");
        option.value = neighborhood.toLowerCase();
        option.textContent = neighborhood;
        neighborhoodFilter.appendChild(option);
      });
    }
  }

  /**
   * Populate district options for the global search based on selected city
   * @param {string} city - Selected city value
   */
  function populateDistrictsGlobal(city) {
    // Clear current options except the first one
    while (globalDistrict.options.length > 1) {
      globalDistrict.remove(1);
    }

    // Add districts based on selected city
    let districts = [];

    if (city === "istanbul") {
      districts = ["Şişli", "Kadıköy", "Beşiktaş", "Bayrampaşa", "Beylikdüzü"];
    } else if (city === "ankara") {
      districts = ["Çankaya", "Keçiören", "Mamak"];
    } else if (city === "izmir") {
      districts = ["Karşıyaka", "Konak", "Bornova"];
    }

    // Add options to select
    districts.forEach((district) => {
      const option = document.createElement("option");
      option.value = district.toLowerCase();
      option.textContent = district;
      globalDistrict.appendChild(option);
    });
  }

  /**
   * Populate neighborhood options for the global search based on selected district
   * @param {string} district - Selected district value
   */
  function populateNeighborhoodsGlobal(district) {
    //Clear current options except the first one

    //This removes the second option every time the loop runs until only 'Select...' is left in the dropdown.
    while (globalNeighborhood.options.length > 1) {
      globalNeighborhood.remove(1);
    }

    //Add neighborhoods based on selected district
    let neighborhoods = [];

    if (district === "şişli" || district === "sisli") {
      neighborhoods = ["Mecidiyeköy", "Esentepe", "Fulya"];
    } else if (district === "kadıköy" || district === "kadikoy") {
      neighborhoods = ["Moda", "Caferağa", "Fenerbahçe"];
    } else if (district === "beşiktaş" || district === "besiktas") {
      neighborhoods = ["Levent", "Ortaköy", "Etiler"];
    } else if (district === "çankaya" || district === "cankaya") {
      neighborhoods = ["Kızılay", "Çukurambar", "Bahçelievler"];
    }

    // Add options to select
    neighborhoods.forEach((neighborhood) => {
      const option = document.createElement("option");
      option.value = neighborhood.toLowerCase();
      option.textContent = neighborhood;
      globalNeighborhood.appendChild(option);
    });
  }

  // Initialize the page
  function init() {
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

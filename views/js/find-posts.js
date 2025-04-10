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
  const pageNumbers = document.querySelectorAll(".page-number");
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

  // Sample data for demonstration purposes
  // In a real application, this would come from an API call
  const samplePosts = [
    // Posts would be fetched from the server
  ];

  /**
   * Initialize event listeners
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

        // Update filter and refresh posts
        updateFilters({ category: category, page: 1 });
      });
    });

    // Location filters
    cityFilter.addEventListener("change", function () {
      updateFilters({
        city: this.value,
        // Reset dependent filters when parent changes
        district: "",
        neighborhood: "",
        page: 1,
      });

      // In a real application, you would now fetch districts for the selected city
      // and update the district select options
      updateDistrictOptions(this.value);
    });

    districtFilter.addEventListener("change", function () {
      updateFilters({
        district: this.value,
        // Reset dependent filters when parent changes
        neighborhood: "",
        page: 1,
      });

      // In a real application, you would now fetch neighborhoods for the selected district
      // and update the neighborhood select options
      updateNeighborhoodOptions(this.value);
    });

    neighborhoodFilter.addEventListener("change", function () {
      updateFilters({
        neighborhood: this.value,
        page: 1,
      });
    });

    // Sorting functionality
    sortSelect.addEventListener("change", function () {
      updateFilters({ sort: this.value });
    });

    // Pagination
    pageNumbers.forEach((button) => {
      button.addEventListener("click", function () {
        const page = parseInt(this.textContent);
        updateFilters({ page: page });
      });
    });

    prevButton.addEventListener("click", function () {
      if (!this.hasAttribute("disabled")) {
        updateFilters({ page: currentFilters.page - 1 });
      }
    });

    nextButton.addEventListener("click", function () {
      if (!this.hasAttribute("disabled")) {
        updateFilters({ page: currentFilters.page + 1 });
      }
    });

    // Global Search Bar functionality
    globalSearchButton.addEventListener("click", function () {
      // Collect all search parameters
      const searchParams = {
        search: globalSearchInput.value.trim(),
        category: globalCategories.value,
        page: 1,
      };

      // Add location parameters if selected
      if (globalCity.value) {
        searchParams.city = globalCity.value;

        if (globalDistrict.value) {
          searchParams.district = globalDistrict.value;

          if (globalNeighborhood.value) {
            searchParams.neighborhood = globalNeighborhood.value;
          }
        }

        // Add radius if location is selected and radius is not "whole area"
        if (globalRadius.value !== "0") {
          searchParams.radius = globalRadius.value;
        }
      }

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
      if (this.value) {
        globalDistrict.disabled = false;
        globalRadius.disabled = false; // Enable radius when city is selected

        // Populate districts for the selected city
        populateDistrictsGlobal(this.value);
      } else {
        // Disable and reset dependent fields
        globalDistrict.disabled = true;
        globalDistrict.value = "";
        globalNeighborhood.disabled = true;
        globalNeighborhood.value = "";
        globalRadius.disabled = true;
      }
    });

    // District select - enable/disable neighborhood select based on selection
    globalDistrict.addEventListener("change", function () {
      if (this.value) {
        globalNeighborhood.disabled = false;

        // Populate neighborhoods for the selected district
        populateNeighborhoodsGlobal(this.value);
      } else {
        // Disable and reset dependent field
        globalNeighborhood.disabled = true;
        globalNeighborhood.value = "";
      }
    });
  }

  /**
   * Update filters and refresh the posts display
   * @param {Object} newFilters - Object containing the filter properties to update
   */
  function updateFilters(newFilters) {
    // Update the filter state
    currentFilters = { ...currentFilters, ...newFilters };

    // Apply the new filters
    applyFilters();

    // Update UI to reflect filter state
    updateFilterUI();
  }

  /**
   * Apply current filters to posts data and update the display
   */
  function applyFilters() {
    // In a real application, this would make an API call with the filter parameters
    // For demo, we'll just log the current filter state
    console.log("Applying filters:", currentFilters);

    // This would be replaced with actual API call
    fetchPosts(currentFilters);
  }

  /**
   * Update UI elements to reflect the current filter state
   */
  function updateFilterUI() {
    // Update category buttons
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

    // Update location selects
    cityFilter.value = currentFilters.city;
    districtFilter.value = currentFilters.district;
    neighborhoodFilter.value = currentFilters.neighborhood;

    // Update sort select
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

    // Make actual API call with filters
    fetch("/api/posts?" + new URLSearchParams(filters))
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        if (data.success) {
          renderPosts(data.data);

          // Update pagination data if provided
          if (data.pagination) {
            updatePagination(data.pagination);
          } else {
            // Basic pagination data if not provided by API
            updatePagination({
              currentPage: currentFilters.page,
              totalPages: Math.ceil(data.count / 10),
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

    // Update results count
    resultsCount.textContent = posts.length;

    // Clear posts grid
    postsGrid.innerHTML = "";

    // Render each post
    posts.forEach((post) => {
      // Check if post is recent (less than 3 days old)
      const postDate = new Date(post.createdAt);
      const now = new Date();
      const isNew = (now - postDate) / (1000 * 60 * 60 * 24) < 3;

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
          ${isNew ? '<div class="post-badge">New</div>' : ""}
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
            ).toLocaleDateString("en-US", {
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
    // This is a simplified version, in a real app you would dynamically
    // generate the pagination numbers based on total pages

    // Update active page
    pageNumbers.forEach((button) => {
      const page = parseInt(button.textContent);
      if (page === pagination.currentPage) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    // Enable/disable previous and next buttons
    prevButton.disabled = pagination.currentPage === 1;
    nextButton.disabled = pagination.currentPage === pagination.totalPages;
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

  // Global filters - pass to main filters !!!!!!!!CHECK THIS FUNC LATER
  function applyGlobalFilters() {
    // This function can be expanded if needed to handle special global filter logic
    globalSearchButton.click();
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
    // Clear current options except the first one
    while (globalNeighborhood.options.length > 1) {
      globalNeighborhood.remove(1);
    }

    // Add neighborhoods based on selected district
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
    // Initial load of posts
    applyFilters();
  }

  // Start the application
  init();
});

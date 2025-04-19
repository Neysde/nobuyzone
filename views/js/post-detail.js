// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
  // Initialize image gallery
  initializeGallery();

  // Initialize fullscreen carousel
  initializeCarousel();

  // Initialize map if coordinates are available
  initializeMap();

  // Setup contact button functionality
  setupContactButton();

  // Handle touch events for better mobile interaction
  setupTouchInteractions();

  //Initialize favorite and flag functionality
  initializePostActions();
});

/**
 * Initialize the image gallery with thumbnail functionality and navigation
 */
function initializeGallery() {
  // Get all thumbnails and the main image container
  const thumbnails = document.querySelectorAll(".thumbnail");
  const mainImage = document.getElementById("main-image");
  const prevBtn = mainImage?.querySelector(".gallery-prev");
  const nextBtn = mainImage?.querySelector(".gallery-next");

  if (!mainImage) return;

  // Track current image index
  let currentIndex = 0;
  const maxIndex = thumbnails.length - 1;

  // Add click event listeners to each thumbnail
  thumbnails.forEach((thumbnail, index) => {
    thumbnail.addEventListener("click", function () {
      updateMainImage(index);
    });

    // Add keyboard navigation for accessibility
    thumbnail.setAttribute("tabindex", "0");
    thumbnail.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        updateMainImage(index);
      }
    });
  });

  // Add click handlers for navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent triggering carousel open
      navigateGallery(-1);
    });

    // Make navigation buttons accessible via keyboard
    prevBtn.setAttribute("tabindex", "0");
    prevBtn.setAttribute("aria-label", "Previous image");
    prevBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateGallery(-1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent triggering carousel open
      navigateGallery(1);
    });

    // Make navigation buttons accessible via keyboard
    nextBtn.setAttribute("tabindex", "0");
    nextBtn.setAttribute("aria-label", "Next image");
    nextBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateGallery(1);
      }
    });
  }

  // Navigate to prev/next image
  function navigateGallery(direction) {
    currentIndex =
      (currentIndex + direction + thumbnails.length) % thumbnails.length;
    updateMainImage(currentIndex);
  }

  // Update the main image based on the selected thumbnail
  function updateMainImage(index) {
    // Update current index
    currentIndex = index;

    // Get the image URL from the thumbnail
    const imageUrl = thumbnails[index].querySelector("img").src;

    // Update the main image
    const imgElement = mainImage.querySelector("img");
    imgElement.src = imageUrl;

    // Add alt text based on thumbnail for accessibility
    const thumbnailAlt = thumbnails[index].querySelector("img").alt;
    if (thumbnailAlt) {
      imgElement.alt = thumbnailAlt;
    }

    // Remove 'active' class from all thumbnails
    thumbnails.forEach((thumb) => {
      thumb.classList.remove("active");
      thumb.setAttribute("aria-selected", "false");
    });

    // Add 'active' class to the selected thumbnail
    thumbnails[index].classList.add("active");
    thumbnails[index].setAttribute("aria-selected", "true");

    // Ensure the active thumbnail is visible in the scroll view
    thumbnails[index].scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }
}

/**
 * Initialize the fullscreen carousel functionality
 */
function initializeCarousel() {
  const carousel = document.getElementById("fullscreen-carousel");
  const carouselTrigger = document.querySelector(".carousel-trigger");
  const closeBtn = carousel?.querySelector(".carousel-close");
  const slides = carousel?.querySelectorAll(".carousel-slide");
  const prevBtn = carousel?.querySelector(".carousel-prev");
  const nextBtn = carousel?.querySelector(".carousel-next");
  const currentCounter = document.getElementById("current-image");

  if (!carousel || !slides.length) return;

  // Track the current slide index
  let currentSlide = 0;

  // Check if we're on a mobile device
  const isMobile = window.innerWidth <= 768;

  // Add click event to open the carousel
  if (carouselTrigger) {
    carouselTrigger.addEventListener("click", openCarousel);
  }

  // Close carousel when clicking the close button
  if (closeBtn) {
    closeBtn.addEventListener("click", closeCarousel);

    // Make close button accessible
    closeBtn.setAttribute("tabindex", "0");
    closeBtn.setAttribute("role", "button");
    closeBtn.setAttribute("aria-label", "Close image carousel");
    closeBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeCarousel();
      }
    });
  }

  // Close carousel when clicking outside the image
  carousel.addEventListener("click", function (e) {
    if (
      e.target === carousel ||
      e.target.classList.contains("carousel-container")
    ) {
      closeCarousel();
    }
  });

  // Handle keyboard navigation
  document.addEventListener("keydown", function (e) {
    if (!carousel.classList.contains("active")) return;

    if (e.key === "Escape") {
      closeCarousel();
    } else if (e.key === "ArrowLeft") {
      navigateCarousel(-1);
    } else if (e.key === "ArrowRight") {
      navigateCarousel(1);
    }
  });

  // Add click handlers for carousel navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent event bubbling
      navigateCarousel(-1);
    });

    // Make nav buttons accessible
    prevBtn.setAttribute("tabindex", "0");
    prevBtn.setAttribute("role", "button");
    prevBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateCarousel(-1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent event bubbling
      navigateCarousel(1);
    });

    // Make nav buttons accessible
    nextBtn.setAttribute("tabindex", "0");
    nextBtn.setAttribute("role", "button");
    nextBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateCarousel(1);
      }
    });
  }

  // Open the carousel and display current image
  function openCarousel() {
    // Get current image index from active thumbnail
    const activeThumbnail = document.querySelector(".thumbnail.active");
    if (activeThumbnail) {
      currentSlide = parseInt(activeThumbnail.getAttribute("data-index"), 10);
    }

    // Position the navigation buttons appropriately based on screen size
    if (isMobile) {
      // For mobile screens, position buttons within the visible area
      positionButtonsForMobile();
    }

    // Show the carousel
    carousel.classList.add("active");

    // Completely disable scrolling - multiple approaches for cross-browser support
    document.body.style.overflow = "hidden"; // Standard approach
    document.body.style.position = "fixed"; // Prevents bounce effects on iOS
    document.body.style.width = "100%"; // Maintain width
    document.body.style.top = `-${window.scrollY}px`; // Remember scroll position

    // Show the current slide
    showSlide(currentSlide);

    // Announce for screen readers
    announceToScreenReader("Image carousel opened");
  }

  // Properly position buttons for mobile viewing
  function positionButtonsForMobile() {
    if (!prevBtn || !nextBtn) return;

    // Make sure navigation buttons are visible and properly sized
    const buttonStyles = {
      opacity: "1",
      backgroundColor: "rgba(255, 255, 255, 0.3)",
      width: "42px",
      height: "42px",
    };

    // Apply styles to both buttons
    Object.keys(buttonStyles).forEach((property) => {
      prevBtn.style[property] = buttonStyles[property];
      nextBtn.style[property] = buttonStyles[property];
    });

    // Ensure proper positioning
    prevBtn.style.left = "10px";
    nextBtn.style.right = "10px";
  }

  // Close the carousel
  function closeCarousel() {
    carousel.classList.remove("active");

    // Re-enable scrolling and restore scroll position
    const scrollY = document.body.style.top;
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.width = "";
    document.body.style.top = "";

    // Restore scroll position
    window.scrollTo(0, parseInt(scrollY || "0") * -1);

    // Announce for screen readers
    announceToScreenReader("Image carousel closed");
  }

  // Navigate to the previous or next slide
  function navigateCarousel(direction) {
    currentSlide = (currentSlide + direction + slides.length) % slides.length;
    showSlide(currentSlide);
  }

  // Show a specific slide and update counter
  function showSlide(index) {
    // Hide all slides
    slides.forEach((slide) => slide.classList.remove("active"));

    // Show the selected slide
    slides[index].classList.add("active");

    // Update the counter
    if (currentCounter) {
      currentCounter.textContent = index + 1;
    }

    // Update thumbnail selection in the main gallery
    const thumbnails = document.querySelectorAll(".thumbnail");
    if (thumbnails.length) {
      thumbnails.forEach((thumb) => thumb.classList.remove("active"));
      if (thumbnails[index]) {
        thumbnails[index].classList.add("active");
      }
    }

    // Update page dots
    const pageDots = carousel.querySelectorAll(".page-dot");
    if (pageDots.length) {
      pageDots.forEach((dot, i) => {
        if (i === index) {
          dot.classList.add("active");
        } else {
          dot.classList.remove("active");
        }
      });
    }

    // Announce slide change for screen readers
    announceToScreenReader(`Image ${index + 1} of ${slides.length}`);
  }

  // Create page indicators dynamically if there are multiple slides
  if (slides.length > 1) {
    const pageIndicator = document.createElement("div");
    pageIndicator.className = "page-indicator";
    pageIndicator.setAttribute("aria-hidden", "true"); // Hide from screen readers (redundant info)

    slides.forEach((_, index) => {
      const dot = document.createElement("div");
      dot.className = "page-dot";
      if (index === 0) dot.classList.add("active");

      // Add click event to each dot
      dot.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent event bubbling
        showSlide(index);
      });

      pageIndicator.appendChild(dot);
    });

    carousel.querySelector(".carousel-content").appendChild(pageIndicator);
  }

  // Helper function to announce to screen readers
  function announceToScreenReader(message) {
    let announcer = document.getElementById("sr-announcer");

    // Create the announcer element if it doesn't exist
    if (!announcer) {
      announcer = document.createElement("div");
      announcer.id = "sr-announcer";
      announcer.setAttribute("aria-live", "polite");
      announcer.setAttribute("aria-atomic", "true");
      announcer.classList.add("sr-only"); // Make visually hidden but available to screen readers
      document.body.appendChild(announcer);

      // Apply style to hide visually but keep accessible to screen readers
      announcer.style.position = "absolute";
      announcer.style.width = "1px";
      announcer.style.height = "1px";
      announcer.style.padding = "0";
      announcer.style.margin = "-1px";
      announcer.style.overflow = "hidden";
      announcer.style.clip = "rect(0, 0, 0, 0)";
      announcer.style.whiteSpace = "nowrap";
      announcer.style.border = "0";
    }

    // Set the message
    announcer.textContent = message;
  }
}

/**
 * Initialize the map with the post's location
 */
function initializeMap() {
  // Get the map container
  const mapContainer = document.getElementById("location-map");
  const fullscreenToggle = document.getElementById("fullscreen-toggle");

  if (!mapContainer) return;

  // Get latitude and longitude from data attributes
  let lat = parseFloat(mapContainer.getAttribute("data-lat"));
  let lng = parseFloat(mapContainer.getAttribute("data-lng"));

  // Check if coordinates are valid
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    console.log("Invalid coordinates, using default location");
    // Use a default location (Istanbul coordinates)
    lat = 41.0082;
    lng = 28.9784;

    // Show a message in the map container
    const noLocationMessage = document.createElement("div");
    noLocationMessage.className = "no-location-message";
    noLocationMessage.innerHTML = "Location not available";
    mapContainer.appendChild(noLocationMessage);
  }

  // Initialize Leaflet map with better configuration
  const map = L.map(mapContainer, {
    zoomControl: false, // We'll add zoom control in a better position
    attributionControl: false, // We'll add it in a better position
    scrollWheelZoom: true, // Enable zoom on scroll
  }).setView([lat, lng], 15); // More zoomed in to show vicinity better

  // Add zoom control in a better position
  L.control
    .zoom({
      position: "bottomright",
    })
    .addTo(map);

  // Add attribution in a better position with smaller text on mobile
  const attribution = L.control
    .attribution({
      position: "bottomleft",
      prefix: "",
    })
    .addTo(map);

  // For very small screens, adjust tile loading strategy
  const isMobile = window.innerWidth <= 480;

  // Add tile layer (OpenStreetMap) with lower quality for mobile
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: isMobile ? 17 : 19, // Lower max zoom on mobile
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    updateWhenIdle: isMobile, // Load tiles only when panning ends on mobile
    updateWhenZooming: !isMobile, // Don't update tiles while zooming on mobile
    minZoom: 5,
    maxNativeZoom: isMobile ? 17 : 19, // Limit native zoom on mobile
    tileSize: 256,
    zoomOffset: 0,
    className: "map-tiles", // Add class for potential styling
  }).addTo(map);

  // Only add a marker if we have valid coordinates
  if (!(lat === 41.0082 && lng === 28.9784)) {
    const marker = L.marker([lat, lng]).addTo(map);
  }

  // Handle fullscreen toggle if it exists
  if (fullscreenToggle) {
    let isFullscreen = false;

    fullscreenToggle.addEventListener("click", () => {
      isFullscreen = !isFullscreen;

      // Toggle fullscreen class
      mapContainer.classList.toggle("fullscreen");

      // Update button text/icon
      if (isFullscreen) {
        // For narrow screens, only update the SVG
        if (window.innerWidth <= 415) {
          fullscreenToggle.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg><span class="fullscreen-text">Exit Fullscreen</span>';
        } else {
          fullscreenToggle.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg><span class="fullscreen-text">Exit Fullscreen</span>';
        }
      } else {
        if (window.innerWidth <= 415) {
          fullscreenToggle.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg><span class="fullscreen-text">Fullscreen</span>';
        } else {
          fullscreenToggle.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg><span class="fullscreen-text">Fullscreen</span>';
        }
      }

      // Force map to refresh size
      setTimeout(() => {
        map.invalidateSize();
        map.setView([lat, lng], map.getZoom());

        // Re-enable dragging if in fullscreen mode, regardless of device
        if (isFullscreen) {
          map.dragging.enable();
          map.tap && map.tap.enable();
        } else if (L.Browser.mobile) {
          // Re-disable on mobile when returning from fullscreen
          map.dragging.disable();
          map.tap && map.tap.disable();
        }
      }, 300);
    });
  }

  // Handle window resize - make sure map is properly sized
  window.addEventListener("resize", () => {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  });

  // Invalidate size to ensure map renders correctly
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

/**
 * Set up the contact button functionality
 */
function setupContactButton() {
  const contactBtn = document.getElementById("contact-btn");

  if (!contactBtn) return;

  contactBtn.addEventListener("click", function () {
    // This function would typically open a chat modal or navigate to a
    // contact form. For now, we'll just log to console.
    console.log("Contact seller button clicked");

    // Example implementation:
    // 1. Show a notification
    showNotification("Contact feature will be available soon!", "info");

    // 2. In the future, this could open a modal dialog or redirect to a chat page
    // openContactModal() or window.location.href = '/chat/with-seller/' + sellerId;
  });
}

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, info)
 */
function showNotification(message, type = "info") {
  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // Add notification to the document
  document.body.appendChild(notification);

  // Show notification with animation
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Hide and remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove("show");

    // Remove from DOM after animation
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * Handle touch gestures for better mobile interaction
 */
function setupTouchInteractions() {
  // Setup swipe detection for main image gallery
  const mainImage = document.getElementById("main-image");
  if (mainImage) {
    let touchStartX = 0;
    let touchEndX = 0;

    // Track touch start position
    mainImage.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );

    // Handle touch end to determine swipe direction
    mainImage.addEventListener(
      "touchend",
      function (e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      },
      { passive: true }
    );

    // Process swipe gesture
    function handleSwipe() {
      // Minimum distance required for swipe detection
      const minSwipeDistance = 50;

      if (touchEndX < touchStartX - minSwipeDistance) {
        // Swipe left - go to next image
        const nextBtn = mainImage.querySelector(".gallery-next");
        if (nextBtn) nextBtn.click();
      }

      if (touchEndX > touchStartX + minSwipeDistance) {
        // Swipe right - go to previous image
        const prevBtn = mainImage.querySelector(".gallery-prev");
        if (prevBtn) prevBtn.click();
      }
    }
  }

  // Setup swipe detection for fullscreen carousel
  const carousel = document.getElementById("fullscreen-carousel");
  if (carousel) {
    let touchStartX = 0;
    let touchEndX = 0;

    // Track touch start position
    carousel.addEventListener(
      "touchstart",
      function (e) {
        // Don't trigger on buttons or controls
        if (
          e.target.closest(".carousel-nav") ||
          e.target.closest(".carousel-close")
        )
          return;
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );

    // Handle touch end to determine swipe direction
    carousel.addEventListener(
      "touchend",
      function (e) {
        // Don't trigger on buttons or controls
        if (
          e.target.closest(".carousel-nav") ||
          e.target.closest(".carousel-close")
        )
          return;
        touchEndX = e.changedTouches[0].screenX;
        handleCarouselSwipe();
      },
      { passive: true }
    );

    // Process carousel swipe gesture
    function handleCarouselSwipe() {
      // Minimum distance required for swipe detection
      const minSwipeDistance = 50;

      if (touchEndX < touchStartX - minSwipeDistance) {
        // Swipe left - go to next image
        const nextBtn = carousel.querySelector(".carousel-next");
        if (nextBtn) nextBtn.click();
      }

      if (touchEndX > touchStartX + minSwipeDistance) {
        // Swipe right - go to previous image
        const prevBtn = carousel.querySelector(".carousel-prev");
        if (prevBtn) prevBtn.click();
      }
    }
  }
}

/**
 * Initialize favorite and flag button functionality
 */
function initializePostActions() {
  const favoriteBtn = document.getElementById("favorite-btn");
  const flagBtn = document.getElementById("flag-btn");

  // Setup favorite button
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", async function () {
      try {
        const postId = this.dataset.postId;

        // Use the new toggle favorite endpoint
        const response = await fetch(`/api/posts/${postId}/favorite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();

          // Update UI based on the response
          if (data.isFavorited) {
            favoriteBtn.classList.add("active");
            showNotification("Added to favorites", "success");
          } else {
            favoriteBtn.classList.remove("active");
            showNotification("Removed from favorites", "success");
          }
        } else {
          const data = await response.json();
          throw new Error(data.message || "Failed to update favorites");
        }
      } catch (error) {
        console.error("Error toggling favorite:", error);
        showNotification(error.message || "Error processing request", "error");
      }
    });
  }

  // Setup flag button
  if (flagBtn) {
    flagBtn.addEventListener("click", async function () {
      try {
        const postId = this.dataset.postId;

        // Use the new toggle flag endpoint
        const response = await fetch(`/api/posts/${postId}/flag`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();

          // Update UI based on the response
          if (data.isFlagged) {
            flagBtn.classList.add("active");
            showNotification("Post has been flagged", "success");
          } else {
            flagBtn.classList.remove("active");
            showNotification("Post has been unflagged", "success");
          }
        } else {
          const data = await response.json();
          throw new Error(data.message || "Failed to update flag status");
        }
      } catch (error) {
        console.error("Error toggling flag:", error);
        showNotification(error.message || "Error processing request", "error");
      }
    });
  }
}

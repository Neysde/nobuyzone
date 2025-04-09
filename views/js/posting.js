document.addEventListener("DOMContentLoaded", function () {
  // Initialize variables
  const form = document.getElementById("posting-form");
  const titleInput = document.getElementById("title");
  const titleCount = document.getElementById("titleCount");
  const imageUpload = document.getElementById("image-upload");
  const imageInput = document.getElementById("images");
  const imagePreviews = document.getElementById("image-previews");
  const useMyLocationBtn = document.getElementById("use-my-location");
  let map = null;
  let marker = null;
  let uploadedImages = new Set();
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const mapContainer = document.getElementById("location-map");
  const city = document.getElementById("city");
  const district = document.getElementById("district");
  const street = document.getElementById("street");
  const neighborhood = document.getElementById("neighborhood");
  const apiKey = "67f036a6524c4571002304nfp4826b8"; // Will be moved to .env

  // Add file input programmatically
  const imageSection = document.querySelector(".image-section");

  // Rate limiting queue
  let lastRequestTime = 0;
  const MIN_REQUEST_INTERVAL = 1000; // 1 second

  // Store last valid marker position
  let lastValidMarkerPosition = null;

  // State management for map transitions
  let isTransitioning = false;
  let pinnedLocation = null;

  async function waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();
  }

  // Initialize map with better defaults
  function initMap() {
    map = L.map("location-map", {
      zoomControl: false, // We'll add it in a better position
      attributionControl: false, // We'll add it in a better position
    }).setView([0, 0], 2);

    L.control
      .zoom({
        position: "bottomright",
      })
      .addTo(map);

    L.control
      .attribution({
        position: "bottomleft",
      })
      .addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    // Create initial marker at center
    marker = L.marker(map.getCenter(), {
      draggable: true,
    }).addTo(map);

    // Set up marker drag event handler
    marker.on("dragend", async function (e) {
      if (isTransitioning) return; // Prevent updates during transition
      const pos = e.target.getLatLng();
      pinnedLocation = pos;
      try {
        const data = await reverseGeocode(pos.lat, pos.lng);
        if (data && data.address) {
          updateAddressFields(data.address);
        }
      } catch (error) {
        console.error("Error updating address from marker drag:", error);
      }
    });

    // Add click handler to map
    map.on("click", async function (e) {
      if (isTransitioning) return; // Prevent updates during transition
      pinnedLocation = e.latlng;
      try {
        const data = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        if (data && data.address) {
          updateAddressFields(data.address);
          marker.setLatLng(e.latlng);
        }
      } catch (error) {
        console.error("Error updating address from map click:", error);
      }
    });
  }

  // Initialize the map
  initMap();

  // Title character counter with enhanced feedback
  titleInput.addEventListener("input", function () {
    const count = this.value.length;
    titleCount.textContent = count;

    if (count >= 140) {
      titleCount.style.color = "#e53e3e";
      titleInput.style.borderColor = "#e53e3e";
    } else if (count >= 120) {
      titleCount.style.color = "#ed8936";
      titleInput.style.borderColor = "#ed8936";
    } else {
      titleCount.style.color = "var(--neutral-600)";
      titleInput.style.borderColor = "";
    }

    // Add visual feedback class
    if (count > 0) {
      titleInput.classList.add("has-content");
    } else {
      titleInput.classList.remove("has-content");
    }
  });

  // Enhanced image upload handling
  function setupImageUpload() {
    const dropZone = imageUpload;

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when dragging over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener("drop", handleDrop, false);

    // Handle click to upload
    dropZone.addEventListener("click", () => {
      imageInput.click();
    });

    // Handle file input change
    imageInput.addEventListener("change", handleChange, false);
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight(e) {
    imageUpload.classList.add("dragging");
  }

  function unhighlight(e) {
    imageUpload.classList.remove("dragging");
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  }

  function handleChange(e) {
    const files = e.target.files;
    handleFiles(files);
  }

  function handleFiles(files) {
    const currentCount = uploadedImages.size;
    const remainingSlots = 5 - currentCount;

    if (files.length > remainingSlots) {
      showNotification("Maximum 5 images allowed", "error");
      return;
    }

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        showNotification("Please upload only image files", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        if (uploadedImages.size >= 5) {
          showNotification("Maximum 5 images allowed", "error");
          return;
        }

        const imageId = Date.now() + Math.random().toString(36).substr(2, 9);
        uploadedImages.add(imageId);

        const preview = createImagePreview(e.target.result, imageId);
        imagePreviews.appendChild(preview);

        updateUploadState();
      };
      reader.readAsDataURL(file);
    });
  }

  function createImagePreview(src, id) {
    const div = document.createElement("div");
    div.className = "preview-item";
    div.dataset.imageId = id;

    const img = document.createElement("img");
    img.src = src;
    img.dataset.originalSrc = src; // Store the original data URL for upload

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      uploadedImages.delete(id);
      div.remove();
      updateUploadState();
    });

    div.appendChild(img);
    div.appendChild(removeBtn);
    return div;
  }

  function updateUploadState() {
    if (uploadedImages.size >= 5) {
      imageUpload.classList.add("max-reached");
    } else {
      imageUpload.classList.remove("max-reached");
    }
  }

  // Initialize image upload handling
  setupImageUpload();

  // Geocoding functions
  async function forwardGeocode(address) {
    await waitForRateLimit();
    const url = `https://geocode.maps.co/search?q=${address}&api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
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

  // Update map marker and address fields
  async function updateLocationDisplay(lat, lon) {
    if (!map) initMap();

    // Lock state during update
    isTransitioning = true;
    pinnedLocation = L.latLng(lat, lon);

    if (marker) {
      marker.setLatLng(pinnedLocation);
    } else {
      marker = L.marker(pinnedLocation, {
        draggable: true,
      }).addTo(map);
    }

    map.setView(pinnedLocation, 16, { animate: false });

    try {
      const data = await reverseGeocode(lat, lon);
      if (data && data.address) {
        updateAddressFields(data.address);
      }
    } catch (error) {
      console.error("Error updating address fields:", error);
    } finally {
      // Unlock state after update
      isTransitioning = false;
    }
  }

  // Update address fields from geocoding data
  function updateAddressFields(address) {
    city.value = address.province || "";
    district.value = address.town || "";
    neighborhood.value = address.suburb || "";
    street.value = address.road || "";

    // Add visual feedback
    [city, district, neighborhood, street].forEach((field) => {
      if (field.value) {
        field.classList.add("autofilled");
        setTimeout(() => field.classList.remove("autofilled"), 1000);
      }
    });
  }

  // Toggle fullscreen mode with locked state transitions
  fullscreenToggle.addEventListener("click", () => {
    // Lock the current state
    isTransitioning = true;
    const currentZoom = map.getZoom();

    // If no pinned location exists, create one
    if (!pinnedLocation) {
      pinnedLocation = marker.getLatLng();
    }

    // Toggle fullscreen
    mapContainer.classList.toggle("fullscreen");

    // Handle transition in steps
    setTimeout(() => {
      // Step 1: Invalidate size without moving the map
      map.invalidateSize({ animate: false, pan: false });

      // Step 2: Force the view and marker to pinned location
      map.setView(pinnedLocation, currentZoom, { animate: false });
      marker.setLatLng(pinnedLocation);

      // Step 3: Update button text
      fullscreenToggle.innerHTML = mapContainer.classList.contains("fullscreen")
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg> Exit Fullscreen'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg> Fullscreen';

      // Step 4: Unlock state after everything is complete
      setTimeout(() => {
        isTransitioning = false;
      }, 100);
    }, 300);
  });

  // Handle location button click
  useMyLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showNotification("Geolocation is not supported by your browser", "error");
      return;
    }

    useMyLocationBtn.disabled = true;
    useMyLocationBtn.innerHTML =
      '<span class="loading-spinner"></span> Getting location...';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await updateLocationDisplay(latitude, longitude);
        useMyLocationBtn.disabled = false;
        useMyLocationBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg> Use My Location';
      },
      (error) => {
        console.error("Error getting location:", error);
        showNotification("Could not get your location", "error");
        useMyLocationBtn.disabled = false;
        useMyLocationBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg> Use My Location';
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });

  // Handle address field updates
  let debounceTimer;
  [city, district, neighborhood, street].forEach((field) => {
    field.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const address = [
          street.value,
          neighborhood.value,
          district.value,
          city.value,
        ]
          .filter(Boolean)
          .join(", ");

        if (address.length > 3) {
          const results = await forwardGeocode(address);
          if (results && results.length > 0) {
            const { lat, lon } = results[0];
            updateLocationDisplay(lat, lon);
          }
        }
      }, 500);
    });
  });

  // Form submission with enhanced validation and feedback
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Posting...';

    try {
      // First, upload any images
      const imageUrls = [];
      const imageIds = [];

      // Get image files from the preview items
      const imageItems = document.querySelectorAll(".preview-item img");

      // If we have images, upload them first
      if (imageItems.length > 0) {
        submitBtn.innerHTML =
          '<span class="loading-spinner"></span> Uploading images...';

        // Process each image
        for (let i = 0; i < imageItems.length; i++) {
          const imgElement = imageItems[i];

          // Update progress message
          submitBtn.innerHTML = `<span class="loading-spinner"></span> Uploading image ${
            i + 1
          }/${imageItems.length}...`;

          // Get image data URL
          const dataUrl = imgElement.src;

          // Skip if not a data URL (already uploaded)
          if (!dataUrl.startsWith("data:")) continue;

          try {
            // Convert data URL to blob
            const blob = await fetch(dataUrl).then((r) => r.blob());

            // Create form data for this image
            const imageFormData = new FormData();
            imageFormData.append("image", blob, "image.jpg");

            // Upload image using the dedicated endpoint
            const uploadResponse = await fetch("/api/posts/upload-image", {
              method: "POST",
              body: imageFormData,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              console.error("Image upload error:", errorData);
              throw new Error(errorData.error || "Failed to upload image");
            }

            const imageResult = await uploadResponse.json();

            if (imageResult.success) {
              imageUrls.push(imageResult.data.url);
              imageIds.push(imageResult.data.public_id);
            } else {
              console.error(
                "Image upload response not successful:",
                imageResult
              );
              throw new Error(
                "Failed to upload image: " +
                  (imageResult.error || "Unknown error")
              );
            }
          } catch (error) {
            console.error("Error processing image:", error);
            showNotification(
              "Error uploading image: " + error.message,
              "error"
            );
          }
        }

        submitBtn.innerHTML =
          '<span class="loading-spinner"></span> Creating post...';
      }

      // Now create the form data for the post
      const formData = new FormData(form);

      // Add image URLs and public IDs to the form data
      imageUrls.forEach((url) => formData.append("imageUrls", url));
      imageIds.forEach((id) => formData.append("imageIds", id));

      // Add coordinates if marker exists
      if (marker) {
        const position = marker.getLatLng();
        formData.append("latitude", position.lat);
        formData.append("longitude", position.lng);
      }

      // Convert FormData to JSON for better compatibility
      const formDataObj = {};
      for (const [key, value] of formData.entries()) {
        formDataObj[key] = value;
      }

      console.log("Submitting post data:", formDataObj);

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataObj),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();
      showNotification("Post created successfully!", "success");

      // Redirect after a short delay to show the success message
      setTimeout(() => {
        window.location.href = `/posts/${result.id}`;
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      showNotification("There was a problem creating your post", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // Handle Save as Draft button
  const saveAsDraftBtn = form.querySelector("button.button-outline");
  saveAsDraftBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    // Basic validation - title is required even for drafts
    if (!titleInput.value.trim()) {
      titleInput.classList.add("error");
      showNotification("Please add a title for your draft", "error");
      titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const originalText = saveAsDraftBtn.innerHTML;
    saveAsDraftBtn.disabled = true;
    saveAsDraftBtn.innerHTML =
      '<span class="loading-spinner"></span> Saving...';

    try {
      // First, upload any images
      const imageUrls = [];
      const imageIds = [];

      // Get image files from the preview items
      const imageItems = document.querySelectorAll(".preview-item img");

      // If we have images, upload them first
      if (imageItems.length > 0) {
        saveAsDraftBtn.innerHTML =
          '<span class="loading-spinner"></span> Uploading images...';

        // Process each image
        for (let i = 0; i < imageItems.length; i++) {
          const imgElement = imageItems[i];

          // Update progress message
          saveAsDraftBtn.innerHTML = `<span class="loading-spinner"></span> Uploading image ${
            i + 1
          }/${imageItems.length}...`;

          // Get image data URL
          const dataUrl = imgElement.src;

          // Skip if not a data URL (already uploaded)
          if (!dataUrl.startsWith("data:")) continue;

          try {
            // Convert data URL to blob
            const blob = await fetch(dataUrl).then((r) => r.blob());

            // Create form data for this image
            const imageFormData = new FormData();
            imageFormData.append("image", blob, "image.jpg");

            // Upload image using the dedicated endpoint
            const uploadResponse = await fetch("/api/posts/upload-image", {
              method: "POST",
              body: imageFormData,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              console.error("Image upload error:", errorData);
              throw new Error(errorData.error || "Failed to upload image");
            }

            const imageResult = await uploadResponse.json();

            if (imageResult.success) {
              imageUrls.push(imageResult.data.url);
              imageIds.push(imageResult.data.public_id);
            } else {
              console.error(
                "Image upload response not successful:",
                imageResult
              );
              throw new Error(
                "Failed to upload image: " +
                  (imageResult.error || "Unknown error")
              );
            }
          } catch (error) {
            console.error("Error processing image:", error);
            showNotification(
              "Error uploading image: " + error.message,
              "error"
            );
          }
        }

        saveAsDraftBtn.innerHTML =
          '<span class="loading-spinner"></span> Saving draft...';
      }

      const formData = new FormData(form);
      formData.append("isDraft", "true");

      // Add image URLs and public IDs to the form data
      imageUrls.forEach((url) => formData.append("imageUrls", url));
      imageIds.forEach((id) => formData.append("imageIds", id));

      // Add coordinates if marker exists
      if (marker) {
        const position = marker.getLatLng();
        formData.append("latitude", position.lat);
        formData.append("longitude", position.lng);
      }

      // Convert FormData to JSON for better compatibility
      const formDataObj = {};
      for (const [key, value] of formData.entries()) {
        formDataObj[key] = value;
      }

      console.log("Saving draft data:", formDataObj);

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataObj),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();
      showNotification("Draft saved successfully!", "success");

      // Redirect to drafts page after a short delay
      setTimeout(() => {
        window.location.href = "/profile/drafts";
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      showNotification("There was a problem saving your draft", "error");
      saveAsDraftBtn.disabled = false;
      saveAsDraftBtn.innerHTML = originalText;
    }
  });

  // Form validation
  function validateForm() {
    const requiredFields = form.querySelectorAll("[required]");
    let isValid = true;

    requiredFields.forEach((field) => {
      if (!field.value.trim()) {
        markFieldAsError(field);
        isValid = false;
      } else {
        clearFieldError(field);
      }
    });

    if (!isValid) {
      showNotification("Please fill in all required fields", "error");
      // Scroll to first error
      const firstError = form.querySelector(".error");
      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    return isValid;
  }

  function markFieldAsError(field) {
    field.classList.add("error");
    const errorMessage = document.createElement("div");
    errorMessage.className = "error-message";
    errorMessage.textContent = "This field is required";
    field.parentNode.appendChild(errorMessage);
  }

  function clearFieldError(field) {
    field.classList.remove("error");
    const errorMessage = field.parentNode.querySelector(".error-message");
    if (errorMessage) {
      errorMessage.remove();
    }
  }

  // Notification system
  function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add("show");
    });

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Loading state helper
  function showLoadingState() {
    const loader = document.createElement("div");
    loader.className = "loading-overlay";
    loader.innerHTML = '<span class="loading-spinner"></span>';
    document.body.appendChild(loader);
    return loader;
  }

  function hideLoadingState(loader) {
    if (loader) {
      loader.remove();
    }
  }

  // Add form field interactions
  document
    .querySelectorAll(
      ".form-group input, .form-group textarea, .form-group select"
    )
    .forEach((field) => {
      field.addEventListener("focus", () => {
        field.closest(".form-group").classList.add("focused");
      });

      field.addEventListener("blur", () => {
        field.closest(".form-group").classList.remove("focused");
        if (field.value) {
          field.closest(".form-group").classList.add("has-value");
        } else {
          field.closest(".form-group").classList.remove("has-value");
        }
      });
    });
});

document.addEventListener("DOMContentLoaded", function () {
  // Initialize variables
  const form = document.getElementById("posting-form");

  // Prevent accidental form submission from buttons that aren't explicitly submit buttons
  document.querySelectorAll("button:not([type])").forEach((button) => {
    // Skip buttons that are within action-buttons (submit/draft buttons)
    if (!button.closest(".action-buttons")) {
      button.type = "button";
    }
  });

  const titleInput = document.getElementById("title");
  const titleCount = document.getElementById("titleCount");
  const imageUpload = document.getElementById("image-upload");
  const imageInput = document.getElementById("images");
  const imagePreviews = document.getElementById("image-previews");
  const useMyLocationBtn = document.getElementById("use-my-location");
  let map = null;
  let marker = null;
  // This set only stores image IDs for the UI, not the actual image data with URLs
  let uploadedImageIds = new Set(); // Stores only image IDs for tracking uploaded images in the UI
  let imageIds = new Set(); // Store IDs of existing images from the server
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const mapContainer = document.getElementById("location-map");
  const city = document.getElementById("city");
  const district = document.getElementById("district");
  const street = document.getElementById("street");
  const neighborhood = document.getElementById("neighborhood");
  let apiKey = ""; // Will be loaded from config endpoint
  let minRequestInterval;

  // Fetch configuration from the server
  fetch("/api/config")
    .then((response) => response.json())
    .then((config) => {
      apiKey = config.GEOCODING_API_KEY;
      minRequestInterval = config.MIN_REQUEST_INTERVAL;
    })
    .catch((error) => {
      console.error("Error loading configuration:", error);
    });

  // Image Cropper Elements
  const cropperModal = document.getElementById("image-cropper-modal");
  const imageToCrop = document.getElementById("image-to-crop");
  const closeCropperBtn = document.getElementById("close-cropper");
  const applyCropBtn = document.getElementById("apply-crop");
  const cancelCropBtn = document.getElementById("cancel-crop");

  // Cropper.js instance
  let cropper = null;
  let currentImageFile = null;

  // Add file input programmatically
  const imageSection = document.querySelector(".image-section");

  // Rate limiting queue
  let lastRequestTime = 0;

  //Store last valid marker position
  let lastValidMarkerPosition = null;

  //State management for map transitions
  let isTransitioning = false;
  let pinnedLocation = null;

  //Flag to track if user is actively editing an address field
  let isEditingAddressField = false;

  // Setup for handling multiple contact preferences
  setupContactPreferences();

  // Check if we have draft data to populate
  function loadDraftData() {
    console.log("Checking for draft data...");
    const draftDataElement = document.getElementById("draft-data");
    console.log("Draft data element exists:", draftDataElement ? "yes" : "no");

    if (!draftDataElement) return;

    try {
      const textContent = draftDataElement.textContent.trim();
      console.log("Draft data content:", textContent);

      const draftData = JSON.parse(textContent);
      console.log("Parsed draft data:", draftData);

      // Add draftId as a hidden field to the form
      if (draftData._id) {
        // First check if the field already exists
        let draftIdField = document.getElementById("draft-id");
        if (!draftIdField) {
          // Create the hidden field
          draftIdField = document.createElement("input");
          draftIdField.type = "hidden";
          draftIdField.id = "draft-id";
          draftIdField.name = "draftId";
          form.appendChild(draftIdField);
        }
        // Set the value
        draftIdField.value = draftData._id;
        console.log("Added draft ID to form:", draftData._id);
      }

      // Populate form fields with draft data
      if (draftData.title) {
        titleInput.value = draftData.title;
        titleInput.dispatchEvent(new Event("input")); // Trigger character counter update
      }

      if (draftData.category) {
        document.getElementById("category").value = draftData.category;
      }

      if (draftData.condition) {
        document.getElementById("condition").value = draftData.condition;
      }

      if (draftData.description) {
        document.getElementById("description").value = draftData.description;
      }

      // Set location fields
      if (draftData.location) {
        if (draftData.location.city) city.value = draftData.location.city;
        if (draftData.location.district)
          district.value = draftData.location.district;
        if (draftData.location.neighborhood)
          neighborhood.value = draftData.location.neighborhood;
        if (draftData.location.street) street.value = draftData.location.street;

        // Set map marker if coordinates exist
        if (draftData.location.coordinates) {
          const lat = draftData.location.coordinates.latitude;
          const lng = draftData.location.coordinates.longitude;

          if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            // Wait for map to be fully initialized
            setTimeout(() => {
              map.setView([lat, lng], 15);
              marker.setLatLng([lat, lng]);
              pinnedLocation = marker.getLatLng();
            }, 100);
          }
        }
      }

      // Set contact preferences (updated for multiple selection)
      if (
        draftData.contactPreferences &&
        Array.isArray(draftData.contactPreferences)
      ) {
        draftData.contactPreferences.forEach((preference) => {
          const contactCheckbox = document.querySelector(
            `input[name="contactPreferences"][value="${preference}"]`
          );
          if (contactCheckbox) {
            contactCheckbox.checked = true;

            // If phone is selected, also make sure to show the input field
            if (
              preference === "phone" &&
              draftData.contactDetails &&
              draftData.contactDetails.phone
            ) {
              const phoneInput = document.getElementById("phone");
              if (phoneInput) {
                phoneInput.value = draftData.contactDetails.phone;
              }
              // Trigger the change event to update visibility
              if (document.getElementById("phone-checkbox")) {
                document
                  .getElementById("phone-checkbox")
                  .dispatchEvent(new Event("change"));
              }
            }
          }
        });
      } else if (draftData.contactPreference) {
        // Handle legacy single preference format
        const contactCheckbox = document.querySelector(
          `input[name="contactPreferences"][value="${draftData.contactPreference}"]`
        );
        if (contactCheckbox) {
          contactCheckbox.checked = true;

          // If phone is selected, also make sure to show the input field
          if (
            draftData.contactPreference === "phone" &&
            draftData.contactDetails &&
            draftData.contactDetails.phone
          ) {
            const phoneInput = document.getElementById("phone");
            if (phoneInput) {
              phoneInput.value = draftData.contactDetails.phone;
            }
            // Trigger the change event to update visibility
            if (document.getElementById("phone-checkbox")) {
              document
                .getElementById("phone-checkbox")
                .dispatchEvent(new Event("change"));
            }
          }
        }
      }

      // Load images
      if (draftData.images && draftData.images.length > 0) {
        draftData.images.forEach((image) => {
          if (image.url) {
            const imageId =
              Date.now() + Math.random().toString(36).slice(2, 11);
            uploadedImageIds.add(imageId);
            const preview = createImagePreview(
              image.url,
              imageId,
              image.publicId
            );
            imagePreviews.appendChild(preview);
          }
        });
        updateUploadState();
      }
    } catch (error) {
      console.error("Error loading draft data:", error);
    }
  }

  async function waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < minRequestInterval) {
      //code will wait until this promise is resolved
      await new Promise((resolve) =>
        setTimeout(resolve, minRequestInterval - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();
  }

  // Initialize map with better defaults
  function initMap() {
    map = L.map("location-map", {
      zoomControl: false, //We'll add it in a better position
      attributionControl: false, //We'll add it in a better position
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

    //Set up marker drag event handler
    marker.on("dragend", async function (e) {
      if (isTransitioning) return; // Prevent updates during transition
      const pos = e.target.getLatLng();
      pinnedLocation = pos;

      //Always save the position but only update fields if not editing
      try {
        if (!isEditingAddressField) {
          const data = await reverseGeocode(pos.lat, pos.lng);
          if (data && data.address) {
            updateAddressFields(data.address);
          }
        }
      } catch (error) {
        console.error("Error updating address from marker drag:", error);
      }
    });

    //Add click handler to map
    map.on("click", async function (e) {
      if (isTransitioning) return; //Prevent updates during transition
      pinnedLocation = e.latlng;

      //Always update marker position
      marker.setLatLng(e.latlng);

      //Only update address fields if not editing
      try {
        if (!isEditingAddressField) {
          const data = await reverseGeocode(e.latlng.lat, e.latlng.lng);
          if (data && data.address) {
            updateAddressFields(data.address);
          }
        }
      } catch (error) {
        console.error("Error updating address from map click:", error);
      }
    });
  }

  //Initialize the map
  initMap();

  // Call loadDraftData after map is initialized
  loadDraftData();

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

    //Add visual feedback class
    if (count > 0) {
      titleInput.classList.add("has-content");
    } else {
      titleInput.classList.remove("has-content");
    }
  });

  // Enhanced image upload handling
  function setupImageUpload() {
    const dropZone = imageUpload;

    // Create and add image count display
    const imageCountDisplay = document.createElement("div");
    imageCountDisplay.className = "image-count";
    imageCountDisplay.textContent = "0/5 images";
    imageUpload.parentNode.insertBefore(
      imageCountDisplay,
      imageUpload.nextSibling
    );

    // Initialize count
    updateImageCount();

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    //Highlight drop zone when dragging over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener("drop", handleDrop, false); //false specifies whether to use capturing or bubbling: (false: bubbling) (bubbling: event starts frominside element to outside element)

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
    const currentCount = uploadedImageIds.size;
    const remainingSlots = 5 - currentCount;

    if (files.length > remainingSlots) {
      showNotification("Maximum 5 images allowed", "error");
      return;
    }

    Array.from(files).forEach((file, index) => {
      if (!file.type.startsWith("image/")) {
        showNotification("Please upload only image files", "error");
        return;
      }

      if (index === 0) {
        // Open the cropper for the first image
        openImageCropper(file);
      } else {
        // Process other images directly (optional: could queue them for cropping)
        processImageDirectly(file);
      }
    });
  }

  //Function to process image without cropping
  function processImageDirectly(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      if (uploadedImageIds.size >= 5) {
        showNotification("Maximum 5 images allowed", "error");
        return;
      }

      const imageId = Date.now() + Math.random().toString(36).slice(2, 11);
      uploadedImageIds.add(imageId);

      const preview = createImagePreview(e.target.result, imageId, null);
      imagePreviews.appendChild(preview);

      updateUploadState();
    };
    reader.readAsDataURL(file);
  }

  // Function to open the image cropper
  function openImageCropper(file) {
    currentImageFile = file;

    // Read the file into the cropper
    const reader = new FileReader();
    reader.onload = function (e) {
      // Set the image source
      imageToCrop.src = e.target.result;

      // Show the modal
      cropperModal.classList.add("active");
      document.body.classList.add("modal-open");

      // Wait for the image to load
      imageToCrop.onload = function () {
        // Destroy existing cropper if it exists
        if (cropper) {
          cropper.destroy();
        }

        // Initialize the Cropper instance
        cropper = new Cropper(imageToCrop, {
          viewMode: 1, // Restrict the crop box to not exceed the size of the canvas
          dragMode: "move", // Move the canvas by default instead of crop
          aspectRatio: NaN, // Free ratio
          autoCropArea: 1, // The size of the crop box relative to the canvas size (0.8 = 80%)
          restore: false, // Don't restore after resize
          guides: true, // Show the dashed lines for guiding
          center: true, // Show the center indicator for guiding
          highlight: true, // Show the white modal to highlight the crop box
          cropBoxMovable: true, // Enable to move the crop box
          cropBoxResizable: true, // Enable to resize the crop box
          toggleDragModeOnDblclick: true, // Toggle drag mode between "crop" and "move" when double click on the cropper
          responsive: true, // Re-render the cropper when resizing the window
          background: true, // Show the grid background of the container
        });
      };
    };
    reader.readAsDataURL(file);
  }

  // Apply crop and add to preview
  function applyImageCrop() {
    if (!cropper) {
      closeCropper();
      return;
    }

    // Get a canvas with the cropped image
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 4096, // Maximum width of output
      maxHeight: 4096, // Maximum height of output
      fillColor: "#fff", // Fill color for transparent areas
    });

    // Generate data URL from canvas
    const croppedImageDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // Add to previews
    const imageId = Date.now() + Math.random().toString(36).slice(2, 11);
    uploadedImageIds.add(imageId);

    const preview = createImagePreview(croppedImageDataUrl, imageId, null);
    imagePreviews.appendChild(preview);

    updateUploadState();

    // Close the cropper
    closeCropper();
  }

  // Close the cropper
  function closeCropper() {
    cropperModal.classList.remove("active");
    document.body.classList.remove("modal-open");

    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    currentImageFile = null;
  }

  // Set up cropper button events
  closeCropperBtn.addEventListener("click", closeCropper);
  cancelCropBtn.addEventListener("click", closeCropper);
  applyCropBtn.addEventListener("click", applyImageCrop);

  // Create image preview element
  function createImagePreview(src, id, publicId) {
    const div = document.createElement("div");
    div.className = "preview-item";
    div.dataset.imageId = id;

    const img = document.createElement("img");
    img.src = src;
    img.dataset.originalSrc = src; // Store the original data URL for upload

    // Store publicId if available (for Cloudinary deletion)
    if (publicId) {
      img.dataset.publicId = publicId;
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.type = "button"; // Explicitly set button type to prevent form submission
    removeBtn.innerHTML = "×";
    removeBtn.addEventListener("click", async (e) => {
      e.preventDefault(); // Prevent any form submission
      e.stopPropagation(); // Stop event bubbling

      // Check if this is an uploaded image with a publicId (not a new local image)
      if (!src.startsWith("data:") && img.dataset.publicId) {
        try {
          // Use the existing delete endpoint instead of the posts-specific one
          const deleteResponse = await fetch(
            `/api/delete/${encodeURIComponent(img.dataset.publicId)}`,
            {
              method: "DELETE",
            }
          );

          if (!deleteResponse.ok) {
            console.error("Failed to delete image from Cloudinary");
          } else {
            console.log("Successfully deleted image from Cloudinary");
          }
        } catch (error) {
          console.error("Error deleting image from Cloudinary:", error);
        }
      }

      uploadedImageIds.delete(id);
      imageIds.delete(id); // Also remove from imageIds if it exists there
      div.remove();
      updateUploadState();
    });

    div.appendChild(img);
    div.appendChild(removeBtn);
    return div;
  }

  function updateUploadState() {
    if (uploadedImageIds.size >= 5) {
      imageUpload.classList.add("max-reached");
    } else {
      imageUpload.classList.remove("max-reached");
    }

    // Update the image count display
    updateImageCount();
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
      //Only fetch and update address data if user is not actively editing fields
      if (!isEditingAddressField) {
        const data = await reverseGeocode(lat, lon);
        if (data && data.address) {
          updateAddressFields(data.address);
        }
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
    // Skip updating if user is actively editing an address field
    if (isEditingAddressField) return;

    // Set values from geocoding with simple fallbacks
    city.value = address.province || address.city || "";
    district.value = address.town || "";
    neighborhood.value = address.suburb || "";
    street.value = address.road || "";

    // Log the values for debugging
    console.log("Updated address fields from geocoding:", {
      city: city.value,
      district: district.value,
      neighborhood: neighborhood.value,
      street: street.value,
    });

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
  const addressFields = [city, district, neighborhood, street];

  addressFields.forEach((field) => {
    // Set flag when user focuses on input field
    field.addEventListener("focus", () => {
      isEditingAddressField = true;
    });

    // Clear the flag when user leaves the field
    field.addEventListener("blur", () => {
      // Small delay to ensure field is actually blurred before allowing updates
      setTimeout(() => {
        // Only clear flag if no other address field is focused
        if (!addressFields.some((f) => document.activeElement === f)) {
          isEditingAddressField = false;
        }
      }, 100);
    });

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

    // Validate form before submission
    if (!validateForm()) {
      return false;
    }

    let loader = showLoadingState();

    try {
      // Get form data
      const formData = new FormData(form);

      // Fix for multiple contact preferences
      // Remove single contactPreferences value if it exists in formData
      formData.delete("contactPreferences");

      // Get all checked contact preference checkboxes and add them to formData
      const checkedPreferences = document.querySelectorAll(
        'input[name="contactPreferences"]:checked'
      );
      checkedPreferences.forEach((checkbox) => {
        formData.append("contactPreferences", checkbox.value);
      });

      // Build location object
      const location = {
        city: formData.get("city"),
        district: formData.get("district"),
        neighborhood: formData.get("neighborhood"),
        street: formData.get("street"),
      };

      // Get coordinates from the marker
      if (marker) {
        const position = marker.getLatLng();
        formData.append("latitude", position.lat);
        formData.append("longitude", position.lng);
      }

      // Convert FormData to JSON object for the API
      const jsonData = {
        title: formData.get("title"),
        category: formData.get("category"),
        condition: formData.get("condition"),
        description: formData.get("description"),
        location,
        latitude: formData.get("latitude"),
        longitude: formData.get("longitude"),
        // Use the array of contact preferences we just set up
        contactPreferences: Array.from(checkedPreferences).map(
          (checkbox) => checkbox.value
        ),
        phoneNumber: formData.get("phoneNumber"),
      };

      // Process and upload images if available
      const imageItems = document.querySelectorAll(".preview-item img");
      if (imageItems.length > 0) {
        const imageUrls = [];
        const imageIds = [];

        // Show progress to user
        hideLoadingState(loader);
        loader = showLoadingState(
          `Processing images... (0/${imageItems.length})`
        );

        // Process each image
        for (let i = 0; i < imageItems.length; i++) {
          const imgElement = imageItems[i];
          const dataUrl = imgElement.src;

          // Update progress message
          hideLoadingState(loader);
          loader = showLoadingState(
            `Processing images... (${i + 1}/${imageItems.length})`
          );

          // If already uploaded to Cloudinary (not a data URL), add directly
          if (!dataUrl.startsWith("data:") && imgElement.dataset.publicId) {
            imageUrls.push(dataUrl);
            imageIds.push(imgElement.dataset.publicId);
            continue;
          }

          // For new images (data URLs), upload to Cloudinary first
          if (dataUrl.startsWith("data:")) {
            try {
              // Convert data URL to blob
              const blob = await fetch(dataUrl).then((r) => r.blob());

              // Create form data for this image
              const imageFormData = new FormData();
              imageFormData.append("image", blob, "image.jpg");

              // Update progress message
              hideLoadingState(loader);
              loader = showLoadingState(
                `Uploading image ${i + 1}/${imageItems.length}...`
              );

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
              // Continue with other images even if one fails
            }
          }
        }

        // Set the image URLs and IDs in the request body
        if (imageUrls.length > 0 && imageIds.length > 0) {
          jsonData.imageUrls = imageUrls;
          jsonData.imageIds = imageIds;
        }

        // Reset loader for submission
        hideLoadingState(loader);
        loader = showLoadingState("Submitting post...");
      }

      // Determine if this is a new post or updating a draft
      const draftId = formData.get("draftId");
      const apiUrl = draftId ? `/api/posts/${draftId}` : "/api/posts";
      const method = draftId ? "PUT" : "POST";

      // If we're updating an existing draft, set the _id field in the format expected by the backend
      if (draftId) {
        jsonData._id = draftId;
      }

      // Organize location data properly - get values directly from form elements to avoid issues
      const cityField = form.querySelector("#city");
      const districtField = form.querySelector("#district");
      const neighborhoodField = form.querySelector("#neighborhood");
      const streetField = form.querySelector("#street");

      // Get values directly from the form fields
      jsonData.location = {
        city: cityField ? cityField.value : "",
        district: districtField ? districtField.value : "",
        neighborhood: neighborhoodField ? neighborhoodField.value : "",
        street: streetField ? streetField.value : "",
        coordinates: {
          latitude:
            jsonData.latitude && !isNaN(parseFloat(jsonData.latitude))
              ? parseFloat(jsonData.latitude)
              : 0,
          longitude:
            jsonData.longitude && !isNaN(parseFloat(jsonData.longitude))
              ? parseFloat(jsonData.longitude)
              : 0,
        },
      };

      // Check if the location fields are actually present and contain values
      const locationFieldsPresent =
        form.querySelector("#city") &&
        form.querySelector("#district") &&
        form.querySelector("#neighborhood") &&
        form.querySelector("#street");

      console.log("Location fields present in form:", locationFieldsPresent);

      // Check the actual IDs and names of the fields in the form
      const cityFieldInForm = form.querySelector("#city");
      const districtFieldInForm = form.querySelector("#district");
      const neighborhoodFieldInForm = form.querySelector("#neighborhood");
      const streetFieldInForm = form.querySelector("#street");

      console.log(
        "City field:",
        cityFieldInForm
          ? {
              id: cityFieldInForm.id,
              name: cityFieldInForm.name,
              value: cityFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "District field:",
        districtFieldInForm
          ? {
              id: districtFieldInForm.id,
              name: districtFieldInForm.name,
              value: districtFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "Neighborhood field:",
        neighborhoodFieldInForm
          ? {
              id: neighborhoodFieldInForm.id,
              name: neighborhoodFieldInForm.name,
              value: neighborhoodFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "Street field:",
        streetFieldInForm
          ? {
              id: streetFieldInForm.id,
              name: streetFieldInForm.name,
              value: streetFieldInForm.value,
            }
          : "Not found"
      );

      if (locationFieldsPresent) {
        console.log("Location field values:", {
          city: form.querySelector("#city").value,
          district: form.querySelector("#district").value,
          neighborhood: form.querySelector("#neighborhood").value,
          street: form.querySelector("#street").value,
        });
      } else {
        console.warn("Some location fields are missing from the form");
      }

      // Log the raw location data before organizing
      console.log("Raw form location data:", {
        city: jsonData.city,
        district: jsonData.district,
        neighborhood: jsonData.neighborhood,
        street: jsonData.street,
        latitude: jsonData.latitude,
        longitude: jsonData.longitude,
      });

      // Log the structured location data
      console.log("Structured location data:", jsonData.location);

      // Verify the location object is properly formed
      if (!jsonData.location || typeof jsonData.location !== "object") {
        console.error("Location object is not properly formed!");
        jsonData.location = {
          city: "",
          district: "",
          neighborhood: "",
          street: "",
          coordinates: { latitude: 0, longitude: 0 },
        };
      }

      // Ensure coordinates exist within location
      if (!jsonData.location.coordinates) {
        jsonData.location.coordinates = { latitude: 0, longitude: 0 };
      }

      // Remove the individual location fields since they're now in the location object
      delete jsonData.city;
      delete jsonData.district;
      delete jsonData.neighborhood;
      delete jsonData.street;
      delete jsonData.latitude;
      delete jsonData.longitude;

      const response = await fetch(apiUrl, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          responseData.message ||
          "Network response was not ok";
        console.error("Server error response:", responseData);
        throw new Error(errorMessage);
      }

      showNotification("Post created successfully!", "success");

      // Redirect after a short delay to show the success message
      setTimeout(() => {
        window.location.href = `/posts/${
          responseData.data?._id || responseData.id || draftId
        }`;
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      showNotification("There was a problem creating your post", "error");

      // Make sure loader exists before trying to modify it
      if (loader) {
        hideLoadingState(loader);
      }
    }
  });

  // Handle Save as Draft button
  const saveAsDraftBtn = form.querySelector(
    ".action-buttons button.button-outline"
  );
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

      // If we have images, process them
      if (imageItems.length > 0) {
        saveAsDraftBtn.innerHTML =
          '<span class="loading-spinner"></span> Processing images...';

        // Process each image
        for (let i = 0; i < imageItems.length; i++) {
          const imgElement = imageItems[i];

          // Get image data URL or source
          const dataUrl = imgElement.src;

          // If this is an already uploaded image (not a data URL), add it directly to our arrays
          if (!dataUrl.startsWith("data:")) {
            // Extract the necessary information from the existing image URL
            try {
              const url = dataUrl;

              // Try to find publicId from data attribute if available
              let publicId = imgElement.dataset.publicId;

              // If no public ID in data attribute, try to extract from URL
              if (!publicId) {
                // Extract the public ID from the URL path
                const urlParts = url.split("/");
                publicId = urlParts[urlParts.length - 1].split(".")[0]; // Get last part without extension
                if (urlParts[urlParts.length - 2]) {
                  publicId = urlParts[urlParts.length - 2] + "/" + publicId; // Include folder
                }
              }

              // Add to our lists
              imageUrls.push(url);
              imageIds.push(publicId);

              continue; // Skip to next image
            } catch (error) {
              console.error("Error processing existing image:", error);
            }
          }

          // For new images (those starting with data:), upload them
          if (dataUrl.startsWith("data:")) {
            // Update progress message
            saveAsDraftBtn.innerHTML = `<span class="loading-spinner"></span> Uploading image ${
              i + 1
            }/${imageItems.length}...`;

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
        }

        saveAsDraftBtn.innerHTML =
          '<span class="loading-spinner"></span> Saving draft...';
      }

      const formData = new FormData(form);
      formData.append("isDraft", "true");

      // Debug: Log form entries before processing
      console.log("Form fields before processing:");
      for (const [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
      }

      // Add image URLs and public IDs to the form data
      imageUrls.forEach((url) => formData.append("imageUrls", url));
      imageIds.forEach((id) => formData.append("imageIds", id));

      // Add coordinates if marker exists
      if (marker) {
        const position = marker.getLatLng();
        formData.append("latitude", position.lat);
        formData.append("longitude", position.lng);
        console.log(
          "Added marker coordinates to draft:",
          position.lat,
          position.lng
        );
      } else {
        console.warn(
          "No map marker found for draft - using default coordinates (0,0)"
        );
        formData.append("latitude", 0);
        formData.append("longitude", 0);
      }

      // Convert FormData to JSON for better compatibility
      const formDataObj = {};
      for (const [key, value] of formData.entries()) {
        // Handle multiple values for the same key (arrays like imageUrls and imageIds)
        if (key === "imageUrls" || key === "imageIds") {
          if (!formDataObj[key]) {
            formDataObj[key] = [];
          }
          formDataObj[key].push(value);
        } else {
          formDataObj[key] = value; //will look like this {title: "example"} etc.
        }
      }

      console.log("Saving draft data:", formDataObj); //will be removed later

      // If we're updating an existing draft, set the _id field in the format expected by the backend
      if (formDataObj.draftId) {
        formDataObj._id = formDataObj.draftId;
      }

      // Organize location data properly - get values directly from form elements to avoid issues
      const cityField = form.querySelector("#city");
      const districtField = form.querySelector("#district");
      const neighborhoodField = form.querySelector("#neighborhood");
      const streetField = form.querySelector("#street");

      // Get values directly from the form fields
      formDataObj.location = {
        city: cityField ? cityField.value : "",
        district: districtField ? districtField.value : "",
        neighborhood: neighborhoodField ? neighborhoodField.value : "",
        street: streetField ? streetField.value : "",
        coordinates: {
          latitude:
            formDataObj.latitude && !isNaN(parseFloat(formDataObj.latitude))
              ? parseFloat(formDataObj.latitude)
              : 0,
          longitude:
            formDataObj.longitude && !isNaN(parseFloat(formDataObj.longitude))
              ? parseFloat(formDataObj.longitude)
              : 0,
        },
      };

      // Check if the location fields are actually present and contain values
      const locationFieldsPresent =
        form.querySelector("#city") &&
        form.querySelector("#district") &&
        form.querySelector("#neighborhood") &&
        form.querySelector("#street");

      console.log("Location fields present in form:", locationFieldsPresent);

      // Check the actual IDs and names of the fields in the form
      const cityFieldInForm = form.querySelector("#city");
      const districtFieldInForm = form.querySelector("#district");
      const neighborhoodFieldInForm = form.querySelector("#neighborhood");
      const streetFieldInForm = form.querySelector("#street");

      console.log(
        "City field:",
        cityFieldInForm
          ? {
              id: cityFieldInForm.id,
              name: cityFieldInForm.name,
              value: cityFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "District field:",
        districtFieldInForm
          ? {
              id: districtFieldInForm.id,
              name: districtFieldInForm.name,
              value: districtFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "Neighborhood field:",
        neighborhoodFieldInForm
          ? {
              id: neighborhoodFieldInForm.id,
              name: neighborhoodFieldInForm.name,
              value: neighborhoodFieldInForm.value,
            }
          : "Not found"
      );
      console.log(
        "Street field:",
        streetFieldInForm
          ? {
              id: streetFieldInForm.id,
              name: streetFieldInForm.name,
              value: streetFieldInForm.value,
            }
          : "Not found"
      );

      if (locationFieldsPresent) {
        console.log("Location field values:", {
          city: form.querySelector("#city").value,
          district: form.querySelector("#district").value,
          neighborhood: form.querySelector("#neighborhood").value,
          street: form.querySelector("#street").value,
        });
      } else {
        console.warn("Some location fields are missing from the form");
      }

      // Log the raw location data before organizing
      console.log("Raw form location data:", {
        city: formDataObj.city,
        district: formDataObj.district,
        neighborhood: formDataObj.neighborhood,
        street: formDataObj.street,
        latitude: formDataObj.latitude,
        longitude: formDataObj.longitude,
      });

      // Log the structured location data
      console.log("Structured location data:", formDataObj.location);

      // Verify the location object is properly formed
      if (!formDataObj.location || typeof formDataObj.location !== "object") {
        console.error("Location object is not properly formed!");
        formDataObj.location = {
          city: "",
          district: "",
          neighborhood: "",
          street: "",
          coordinates: { latitude: 0, longitude: 0 },
        };
      }

      // Ensure coordinates exist within location
      if (!formDataObj.location.coordinates) {
        formDataObj.location.coordinates = { latitude: 0, longitude: 0 };
      }

      // Remove the individual location fields since they're now in the location object
      delete formDataObj.city;
      delete formDataObj.district;
      delete formDataObj.neighborhood;
      delete formDataObj.street;
      delete formDataObj.latitude;
      delete formDataObj.longitude;

      // Determine if this is a new draft or updating an existing one
      const draftId = formDataObj.draftId;
      // Use the new dedicated endpoint for drafts
      const apiUrl = "/api/post-drafts";
      const method = "POST";

      // Always set isDraft to true when saving as draft
      formDataObj.isDraft = "true";

      // If we're updating an existing draft, set the _id field in the format expected by the backend
      if (draftId) {
        formDataObj._id = draftId;
      }

      const response = await fetch(apiUrl, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataObj),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          responseData.message ||
          "Network response was not ok";
        console.error("Server error response:", responseData);
        throw new Error(errorMessage);
      }

      showNotification("Draft saved successfully!", "success");
      console.log("Draft saved successfully:", responseData);

      // Redirect to drafts page after a short delay
      setTimeout(() => {
        redirectWithUserId("dashboard", "#drafts");
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      showNotification("There was a problem saving your draft", "error");

      // Make sure saveAsDraftBtn exists before trying to modify it
      if (saveAsDraftBtn) {
        saveAsDraftBtn.disabled = false;
        saveAsDraftBtn.innerHTML = originalText;
      }
    }
  });

  // Form validation (updated to check contact preferences)
  function validateForm() {
    const requiredFields = form.querySelectorAll("[required]");
    let isValid = true;

    // Validate all required fields including location fields
    requiredFields.forEach((field) => {
      if (!field.value.trim()) {
        markFieldAsError(field);
        isValid = false;
      } else {
        clearFieldError(field);
      }
    });

    // Make sure we have coordinates
    if (!marker) {
      showNotification("Please set a location on the map", "error");
      isValid = false;
    }

    // Validate contact preferences (at least one must be selected)
    const contactCheckboxes = document.querySelectorAll(
      'input[name="contactPreferences"]'
    );
    const isAnyContactSelected = Array.from(contactCheckboxes).some(
      (cb) => cb.checked
    );

    if (!isAnyContactSelected) {
      showNotification("Please select at least one contact method", "error");
      const contactCard = document.querySelector(".contact-card");
      if (contactCard) {
        contactCard.classList.add("error-container");
        contactCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      isValid = false;
    }

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

  //redirection with userId - more generic version
  async function redirectWithUserId(baseEndpoint, hashOrQuery) {
    try {
      const response = await fetch("/api/user/current");
      if (!response.ok) {
        throw new Error("Failed to get user ID");
      }

      const data = await response.json();
      if (data.success) {
        //Construct the URL with the provided baseEndpoint and optional hash/query
        let url = `/${baseEndpoint}/${data.userId}`;

        //Add hash or query parameters if provided
        if (hashOrQuery) {
          url += hashOrQuery;
        }

        window.location.href = url;
      } else {
        console.error("Error:", data.error);
      }
    } catch (error) {
      console.error(`Error redirecting to ${baseEndpoint}:`, error);
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

  ///CHECK FOR THEM LATER!!!!!!!!!!!!!
  // Loading state helper
  function showLoadingState(message = "Loading...") {
    const loader = document.createElement("div");
    loader.className = "loading-overlay";
    loader.innerHTML = `
      <span class="loading-spinner"></span>
      <p>${message}</p>
    `;
    document.body.appendChild(loader);
    return loader;
  }

  function hideLoadingState(loader) {
    if (loader) {
      loader.remove();
    }
  }

  //Add form field interactions
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

  //Prevent Enter key from submitting the form in input fields
  //This prevents the page from reloading and losing uploaded images
  document.querySelectorAll('form input[type="text"]').forEach((input) => {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        //Optionally focus the next input field
        const formElements = Array.from(form.elements);
        const currentIndex = formElements.indexOf(this);
        if (currentIndex > -1 && currentIndex < formElements.length - 1) {
          formElements[currentIndex + 1].focus();
        }
      }
    });
  });

  /**
   * Updates the image count display to show currently uploaded images out of max allowed
   */
  function updateImageCount() {
    // Check if the element exists
    const countDisplay = document.querySelector(".image-count");
    if (!countDisplay) return;

    // Get the current count from either uploadedImageIds or imageIds, depending on context
    let currentCount;

    // First try with uploadedImageIds which is used for newly added images
    if (uploadedImageIds && typeof uploadedImageIds.size === "number") {
      currentCount = uploadedImageIds.size;
    }
    // Then try with imageIds which is used in populateExistingImages
    else if (imageIds && typeof imageIds.size === "number") {
      currentCount = imageIds.size;
    }
    // Fallback - count preview elements
    else {
      currentCount = document.querySelectorAll(".preview-item").length;
    }

    // Update the display text
    countDisplay.textContent = `${currentCount}/5 images`;

    // Visual feedback - change color when approaching limit
    if (currentCount >= 5) {
      countDisplay.classList.add("max-reached");
    } else {
      countDisplay.classList.remove("max-reached");
    }
  }

  /**
   * Populates the image preview container with existing images
   * @param {Array} images - Array of image objects from the server
   */
  function populateExistingImages(images) {
    if (!images || !Array.isArray(images) || images.length === 0) return;

    // Clear existing image IDs
    imageIds.clear();

    // Process each image
    images.forEach((image) => {
      if (image.url && image.id) {
        const imageId = image.id;
        imageIds.add(imageId);

        // Create preview with the image's Cloudinary public ID for deletion
        const preview = createImagePreview(
          image.url,
          imageId,
          image.publicId || extractPublicIdFromUrl(image.url)
        );

        // Add preview to container
        imagePreviews.appendChild(preview);
      }
    });

    // Update image count display
    updateImageCount();
  }

  /**
   * Extract the Cloudinary public ID from a URL
   * @param {string} url - The Cloudinary URL
   * @returns {string|null} - The public ID or null if not found
   */
  function extractPublicIdFromUrl(url) {
    if (!url || typeof url !== "string") return null;

    // Typical Cloudinary URL format: https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[public_id].[extension]
    try {
      // Extract the path after /upload/
      const uploadIndex = url.indexOf("/upload/");
      if (uploadIndex === -1) return null;

      // Get everything after /upload/
      const afterUpload = url.substring(uploadIndex + 8);

      // Remove version if present (v1234567890/)
      const withoutVersion = afterUpload.replace(/^v\d+\//, "");

      // Remove file extension
      const publicId = withoutVersion.replace(/\.[^.]+$/, "");

      return publicId;
    } catch (error) {
      console.error("Error extracting public ID from URL:", error);
      return null;
    }
  }

  /**
   * Setup contact preferences with multiple selection
   * and conditional phone number input visibility
   */
  function setupContactPreferences() {
    const phoneCheckbox = document.getElementById("phone-checkbox");
    const phoneInputContainer = document.getElementById(
      "phone-input-container"
    );

    // Initialize phone input visibility
    updatePhoneInputVisibility();

    // Add event listener for phone checkbox
    if (phoneCheckbox) {
      phoneCheckbox.addEventListener("change", updatePhoneInputVisibility);
    }

    // Add validation to ensure at least one contact preference is selected
    const contactCheckboxes = document.querySelectorAll(
      'input[name="contactPreferences"]'
    );
    contactCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", validateContactPreferences);
    });

    // Function to update phone input visibility
    function updatePhoneInputVisibility() {
      if (phoneCheckbox && phoneCheckbox.checked) {
        // Show phone input
        phoneInputContainer.style.display = "block";
        phoneInputContainer.classList.add("active");

        // Make phone input required when checkbox is checked
        const phoneInput = document.getElementById("phone");
        if (phoneInput) {
          phoneInput.setAttribute("required", "required");
        }
      } else {
        // Hide phone input
        phoneInputContainer.style.display = "none";
        phoneInputContainer.classList.remove("active");

        // Remove required attribute when checkbox is unchecked
        const phoneInput = document.getElementById("phone");
        if (phoneInput) {
          phoneInput.removeAttribute("required");
          // Clear value when hiding
          phoneInput.value = "";
        }
      }
    }

    // Function to validate at least one contact preference is selected
    function validateContactPreferences() {
      const isAnySelected = Array.from(contactCheckboxes).some(
        (cb) => cb.checked
      );

      // Add validation feedback
      const contactCard = document.querySelector(".contact-card");
      if (!isAnySelected && contactCard) {
        contactCard.classList.add("error-container");

        // Add error message if it doesn't exist
        if (!document.querySelector(".contact-error-message")) {
          const errorMessage = document.createElement("div");
          errorMessage.className = "contact-error-message";
          errorMessage.textContent =
            "Please select at least one contact method";
          contactCard.querySelector(".contact-description").after(errorMessage);
        }
      } else {
        // Remove error styling
        if (contactCard) {
          contactCard.classList.remove("error-container");
          const errorMessage = contactCard.querySelector(
            ".contact-error-message"
          );
          if (errorMessage) {
            errorMessage.remove();
          }
        }
      }

      return isAnySelected;
    }
  }

  // Add CSS for error container
  const style = document.createElement("style");
  style.textContent = `
    .error-container {
      border: 1px solid #f56565 !important;
      background-color: rgba(254, 215, 215, 0.1);
    }
    .contact-error-message {
      color: #f56565;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
  `;
  document.head.appendChild(style);
});

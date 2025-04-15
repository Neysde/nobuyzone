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
  let uploadedImages = new Set(); //küme
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const mapContainer = document.getElementById("location-map");
  const city = document.getElementById("city");
  const district = document.getElementById("district");
  const street = document.getElementById("street");
  const neighborhood = document.getElementById("neighborhood");
  const apiKey = "67f036a6524c4571002304nfp4826b8"; // Will be moved to .env

  // Image Cropper Elements
  const cropperModal = document.getElementById("image-cropper-modal");
  const imageToCrop = document.getElementById("image-to-crop");
  const cropBox = document.getElementById("crop-box");
  const closeCropperBtn = document.getElementById("close-cropper");
  const applyCropBtn = document.getElementById("apply-crop");
  const cancelCropBtn = document.getElementById("cancel-crop");

  // Cropper state variables
  let currentImageFile = null;
  let cropperActive = false;
  let cropBoxWidth = 200; // Default width
  let cropBoxHeight = 200; // Default height
  let cropBoxPosition = { x: 0, y: 0 };
  let originalImageDimensions = { width: 0, height: 0 };
  let isDraggingCropBox = false;
  let isResizing = false;
  let activeHandle = null;
  let dragStartPosition = { x: 0, y: 0 };
  let cropBoxStartPosition = { x: 0, y: 0 };
  let cropBoxStartDimensions = { width: 0, height: 0 };

  // Add file input programmatically
  const imageSection = document.querySelector(".image-section");

  // Rate limiting queue
  let lastRequestTime = 0;
  const MIN_REQUEST_INTERVAL = 1000; // 1 second (you can move this to .env maybe)

  //Store last valid marker position
  let lastValidMarkerPosition = null;

  //State management for map transitions
  let isTransitioning = false;
  let pinnedLocation = null;
  
  //Flag to track if user is actively editing an address field
  let isEditingAddressField = false;

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
    const currentCount = uploadedImages.size;
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

  // Function to process image without cropping
  function processImageDirectly(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      if (uploadedImages.size >= 5) {
        showNotification("Maximum 5 images allowed", "error");
        return;
      }

      const imageId = Date.now() + Math.random().toString(36).slice(2, 11);
      uploadedImages.add(imageId);

      const preview = createImagePreview(e.target.result, imageId);
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
      // Reset any previous crop state
      isDraggingCropBox = false;
      isResizing = false;

      // Set the image source and wait for it to load
      imageToCrop.src = e.target.result;

      // Show the modal first so dimensions are correct
      cropperModal.classList.add("active");
      document.body.classList.add("modal-open");
      cropperActive = true;

      imageToCrop.onload = function () {
        // Get original image dimensions
        originalImageDimensions.width = imageToCrop.naturalWidth;
        originalImageDimensions.height = imageToCrop.naturalHeight;

        // Wait a bit for the DOM to update
        setTimeout(() => {
          // Get displayed image dimensions
          const imageRect = imageToCrop.getBoundingClientRect();
          console.log("Image dimensions:", imageRect.width, imageRect.height);

          // Set crop box to match the image dimensions
          cropBoxWidth = imageRect.width;
          cropBoxHeight = imageRect.height;

          // Position crop box in the center of the image
          cropBoxPosition = {
            x: imageRect.width / 2,
            y: imageRect.height / 2,
          };

          // Update crop box position and size
          updateCropBoxStyle();
          console.log("Crop box positioned at:", cropBoxPosition);

          // Initialize crop box event listeners
          initCropBoxEvents();
        }, 100);
      };
    };
    reader.readAsDataURL(file);
  }

  // Update crop box position and size - using direct top/left positioning
  function updateCropBoxStyle() {
    const left = cropBoxPosition.x - cropBoxWidth / 2;
    const top = cropBoxPosition.y - cropBoxHeight / 2;

    cropBox.style.width = `${cropBoxWidth}px`;
    cropBox.style.height = `${cropBoxHeight}px`;
    cropBox.style.left = `${left}px`;
    cropBox.style.top = `${top}px`;
  }

  // Initialize crop box drag and resize events
  function initCropBoxEvents() {
    // Main crop box drag - use direct event listeners
    cropBox.onmousedown = startDraggingCropBox;

    // Resize handles
    const resizeHandles = cropBox.querySelectorAll(".resize-handle");
    resizeHandles.forEach((handle) => {
      handle.onmousedown = function (e) {
        startResizing(e, handle.className.split(" ")[1]);
      };
    });

    // Global event listeners
    document.onmousemove = handleMouseMove;
    document.onmouseup = handleMouseUp;

    // Touch events for mobile
    cropBox.ontouchstart = handleTouchStart;
    document.ontouchmove = handleTouchMove;
    document.ontouchend = handleTouchEnd;
  }

  // Crop box dragging
  function startDraggingCropBox(e) {
    // Ignore if we clicked on a resize handle
    if (e.target.classList.contains("resize-handle")) return;

    e.preventDefault();
    e.stopPropagation();
    isDraggingCropBox = true;
    isResizing = false;

    // Store the starting position
    dragStartPosition = {
      x: e.clientX,
      y: e.clientY,
    };

    cropBoxStartPosition = {
      x: cropBoxPosition.x,
      y: cropBoxPosition.y,
    };

    console.log("Started dragging crop box");
  }

  function handleMouseMove(e) {
    if (isDraggingCropBox) {
      dragCropBox(e);
    } else if (isResizing) {
      resizeCropBox(e);
    }
  }

  function handleMouseUp() {
    isDraggingCropBox = false;
    isResizing = false;
    console.log("Mouse up - stopped dragging/resizing");
  }

  function dragCropBox(e) {
    e.preventDefault();

    const deltaX = e.clientX - dragStartPosition.x;
    const deltaY = e.clientY - dragStartPosition.y;

    console.log("Dragging crop box", deltaX, deltaY);

    // Get current image boundaries
    const imageRect = imageToCrop.getBoundingClientRect();

    // Calculate new position
    let newX = cropBoxStartPosition.x + deltaX;
    let newY = cropBoxStartPosition.y + deltaY;

    // Calculate boundaries to keep crop box within image
    const halfWidth = cropBoxWidth / 2;
    const halfHeight = cropBoxHeight / 2;

    // Constrain to image boundaries
    newX = Math.max(halfWidth, Math.min(newX, imageRect.width - halfWidth));
    newY = Math.max(halfHeight, Math.min(newY, imageRect.height - halfHeight));

    cropBoxPosition = { x: newX, y: newY };
    updateCropBoxStyle();
  }

  // Resize functionality
  function startResizing(e, handleClass) {
    e.preventDefault();
    e.stopPropagation();

    isResizing = true;
    isDraggingCropBox = false;
    activeHandle = handleClass;

    dragStartPosition = {
      x: e.clientX,
      y: e.clientY,
    };

    cropBoxStartPosition = {
      x: cropBoxPosition.x,
      y: cropBoxPosition.y,
    };

    cropBoxStartDimensions = {
      width: cropBoxWidth,
      height: cropBoxHeight,
    };

    console.log("Started resizing with handle:", activeHandle);
  }

  function resizeCropBox(e) {
    e.preventDefault();

    const deltaX = e.clientX - dragStartPosition.x;
    const deltaY = e.clientY - dragStartPosition.y;

    console.log("Resizing crop box", deltaX, deltaY);

    // Get current image boundaries
    const imageRect = imageToCrop.getBoundingClientRect();

    // Calculate new dimensions and position based on which handle is being dragged
    let newWidth = cropBoxStartDimensions.width;
    let newHeight = cropBoxStartDimensions.height;
    let newX = cropBoxStartPosition.x;
    let newY = cropBoxStartPosition.y;

    // Handle different resize corners
    if (activeHandle === "top-left") {
      newWidth = cropBoxStartDimensions.width - deltaX;
      newHeight = cropBoxStartDimensions.height - deltaY;
      newX = cropBoxStartPosition.x + deltaX / 2;
      newY = cropBoxStartPosition.y + deltaY / 2;
    } else if (activeHandle === "top-right") {
      newWidth = cropBoxStartDimensions.width + deltaX;
      newHeight = cropBoxStartDimensions.height - deltaY;
      newX = cropBoxStartPosition.x + deltaX / 2;
      newY = cropBoxStartPosition.y + deltaY / 2;
    } else if (activeHandle === "bottom-left") {
      newWidth = cropBoxStartDimensions.width - deltaX;
      newHeight = cropBoxStartDimensions.height + deltaY;
      newX = cropBoxStartPosition.x + deltaX / 2;
      newY = cropBoxStartPosition.y + deltaY / 2;
    } else if (activeHandle === "bottom-right") {
      newWidth = cropBoxStartDimensions.width + deltaX;
      newHeight = cropBoxStartDimensions.height + deltaY;
      newX = cropBoxStartPosition.x + deltaX / 2;
      newY = cropBoxStartPosition.y + deltaY / 2;
    }

    // Ensure minimum dimensions
    newWidth = Math.max(50, newWidth);
    newHeight = Math.max(50, newHeight);

    // Check if the crop box would extend beyond image boundaries
    const halfWidth = newWidth / 2;
    const halfHeight = newHeight / 2;

    // Constrain to image boundaries
    if (newX - halfWidth < 0) {
      newWidth = newX * 2;
      newX = halfWidth;
    }

    if (newX + halfWidth > imageRect.width) {
      newWidth = (imageRect.width - newX) * 2;
      newX = imageRect.width - halfWidth;
    }

    if (newY - halfHeight < 0) {
      newHeight = newY * 2;
      newY = halfHeight;
    }

    if (newY + halfHeight > imageRect.height) {
      newHeight = (imageRect.height - newY) * 2;
      newY = imageRect.height - halfHeight;
    }

    // Update crop box
    cropBoxWidth = newWidth;
    cropBoxHeight = newHeight;
    cropBoxPosition = { x: newX, y: newY };
    updateCropBoxStyle();
  }

  // Apply crop and add to preview
  function applyImageCrop() {
    // Create a canvas to crop the image
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Calculate the scale between original image and displayed image
    const imageRect = imageToCrop.getBoundingClientRect();
    const scaleX = originalImageDimensions.width / imageRect.width;
    const scaleY = originalImageDimensions.height / imageRect.height;

    // Calculate source coordinates in the original image
    const halfWidth = cropBoxWidth / 2;
    const halfHeight = cropBoxHeight / 2;

    // Calculate crop box coordinates relative to the image
    const cropLeft = cropBoxPosition.x - halfWidth;
    const cropTop = cropBoxPosition.y - halfHeight;

    // Calculate source coordinates in the original image
    const sourceX = Math.max(0, cropLeft) * scaleX;
    const sourceY = Math.max(0, cropTop) * scaleY;
    const sourceWidth = cropBoxWidth * scaleX;
    const sourceHeight = cropBoxHeight * scaleY;

    // Set canvas size to crop box size
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    // Draw the cropped image on the canvas
    ctx.drawImage(
      imageToCrop,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Generate data URL from canvas
    const croppedImageDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // Add to previews
    const imageId = Date.now() + Math.random().toString(36).slice(2, 11);
    uploadedImages.add(imageId);

    const preview = createImagePreview(croppedImageDataUrl, imageId);
    imagePreviews.appendChild(preview);

    updateUploadState();

    // Close the cropper
    closeCropper();
  }

  // Close the cropper
  function closeCropper() {
    cropperModal.classList.remove("active");
    document.body.classList.remove("modal-open");
    cropperActive = false;
    currentImageFile = null;

    // Clear the crop box position
    cropBoxPosition = { x: 0, y: 0 };
    updateCropBoxStyle();
  }

  // Touch event handlers
  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];

    // Check if the touch is on a resize handle
    if (e.target.classList.contains("resize-handle")) {
      // Get the handle class (top-left, top-right, etc.)
      let handleClass = null;
      for (const className of e.target.classList) {
        if (className.includes("-")) {
          handleClass = className;
          break;
        }
      }

      // Create a simulated mouse event
      const simulatedEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: e.target,
      };

      startResizing(simulatedEvent, handleClass);
    } else {
      // Handle crop box dragging
      const simulatedEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: e.target,
      };

      startDraggingCropBox(simulatedEvent);
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const simulatedEvent = {
      preventDefault: () => {},
      clientX: touch.clientX,
      clientY: touch.clientY,
    };

    if (isResizing) {
      resizeCropBox(simulatedEvent);
    } else if (isDraggingCropBox) {
      dragCropBox(simulatedEvent);
    }
  }

  function handleTouchEnd(e) {
    isDraggingCropBox = false;
    isResizing = false;
    console.log("Touch end - stopped dragging/resizing");
  }

  // Set up cropper button events
  closeCropperBtn.addEventListener("click", closeCropper);
  cancelCropBtn.addEventListener("click", closeCropper);
  applyCropBtn.addEventListener("click", applyImageCrop);

  // Create image preview element
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
      e.stopPropagation(); //stops the event from bubbling up to the parent elements
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
        if (!addressFields.some(f => document.activeElement === f)) {
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
            // Convert data URL to blob (binary large object)
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
        // Handle multiple values for the same key (arrays like imageUrls and imageIds)
        if (key === "imageUrls" || key === "imageIds") {
          if (!formDataObj[key]) {
            formDataObj[key] = [];
          }
          formDataObj[key].push(value);
        } else {
          formDataObj[key] = value;
        }
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

  ///CHECK FOR THEM LATER!!!!!!!!!!!!!
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

  function stopDraggingCropBox() {
    isDraggingCropBox = false;
  }

  //Prevent Enter key from submitting the form in input fields
  //This prevents the page from reloading and losing uploaded images
  document.querySelectorAll('form input[type="text"]').forEach(input => {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
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
});

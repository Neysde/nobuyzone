document.addEventListener("DOMContentLoaded", function () {
  // Manually control scroll restoration to prevent jumping to hash.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // Tab navigation functionality
  initTabs();

  // Initialize post-related event listeners
  initPostActions();

  // Initialize profile photo functionality
  initProfilePhoto();

  // Initialize username editing functionality
  initUsernameEdit();

  // Initialize privacy settings
  initPrivacySettings();
  
  // Initialize account deletion functionality
  initAccountDeletion();
});

/**
 * Initialize tab navigation functionality
 */
function initTabs() {
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // Function to activate a tab based on its hash
  const activateTab = (hash) => {
    // If no hash, default to the first tab link's href.
    const targetHash =
      hash || (tabLinks.length > 0 ? tabLinks[0].getAttribute("href") : "");
    if (!targetHash) return; // No tabs on the page.

    const activeTabLink = document.querySelector(
      `.tab-link[href="${targetHash}"]`
    );
    const activeTabPane = document.querySelector(`[data-tab-id="${targetHash.substring(1)}"]`);

    if (activeTabLink && activeTabPane) {
      // Deactivate all other tabs and panes.
      tabLinks.forEach((t) => t.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      // Activate the target tab and pane.
      activeTabLink.classList.add("active");
      activeTabPane.classList.add("active");

      // Update document title based on active tab
      const tabName = targetHash.substring(1);
      let pageTitle = "NoBuyZone";
      
      switch(tabName) {
        case "postings":
          pageTitle = "İlanlarım | NoBuyZone";
          break;
        case "drafts":
          pageTitle = "Taslaklar | NoBuyZone";
          break;
        case "favorites":
          pageTitle = "Favoriler | NoBuyZone";
          break;
        case "messages":
          pageTitle = "Mesajlar | NoBuyZone";
          break;
        case "account":
          pageTitle = "Hesap | NoBuyZone";
          break;
        default:
          pageTitle = "NoBuyZone";
      }
      document.title = pageTitle;

      // Use requestAnimationFrame to scroll to the top just before the next repaint.
      // This is the most reliable way to override the browser's default anchor jump.
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    }
  };

  // Activate tab on initial page load from the URL hash.
  activateTab(window.location.hash);

  // Listen for hash changes to handle navigation from external links (e.g., header).
  window.addEventListener("hashchange", () => {
    activateTab(window.location.hash);
  });

  // Add click event listeners to the dashboard's own tabs.
  tabLinks.forEach((tab) => {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");

      // Update the URL hash if it's different.
      if (window.location.hash !== targetId) {
        // Use pushState to change the URL without a page reload.
        if (history.pushState) {
          history.pushState(null, null, targetId);
        } else {
          // Fallback for older browsers.
          location.hash = targetId;
        }
      }

      // Manually activate the tab.
      // This is necessary because pushState doesn't trigger a 'hashchange' event.
      activateTab(targetId);
    });
  });
}

/**
 * Initialize post-related actions (delete post, remove from favorites)
 */
function initPostActions() {
  // Row click handlers for navigation
  const postRows = document.querySelectorAll(".post-row:not(.draft-row)");
  postRows.forEach((row) => {
    row.addEventListener("click", function (e) {
      // Only navigate if the click wasn't on a button
      if (!e.target.closest("button")) {
        const postId = this.dataset.postId;
        window.location.href = `/posts/${postId}`;
      }
    });
  });

  // Draft row click handlers
  const draftRows = document.querySelectorAll(".draft-row");
  draftRows.forEach((row) => {
    row.addEventListener("click", function (e) {
      // Only navigate if the click wasn't on a button
      if (!e.target.closest("button")) {
        const postId = this.dataset.postId;
        window.location.href = `/posting?draft=${postId}`;
      }
    });
  });

  // Delete post buttons
  const deleteButtons = document.querySelectorAll(".delete-post");
  deleteButtons.forEach((button) => {
    button.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent row click
      const postId = this.dataset.postId;

      if (
        confirm(
          "Bu gönderiyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
        )
      ) {
        deletePost(postId);
      }
    });
  });

  // Delete draft buttons
  const deleteDraftButtons = document.querySelectorAll(".delete-draft");
  deleteDraftButtons.forEach((button) => {
    button.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent row click
      const postId = this.dataset.postId;

      if (confirm("Bu taslağı silmek istediğinizden emin misiniz?")) {
        deleteDraft(postId);
      }
    });
  });

  // Remove from favorites buttons
  const unfavoriteButtons = document.querySelectorAll(".remove-favorite");
  unfavoriteButtons.forEach((button) => {
    button.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent row click
      const postId = this.dataset.postId;
      removeFromFavorites(postId);
    });
  });
}

/**
 * Send request to delete a post
 * @param {string} postId - The ID of the post to delete
 */
async function deletePost(postId) {
  try {
    showLoadingState();

    const response = await fetch(`/api/posts/${postId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Gönderi silinemedi");
    }

    // Remove the post row
    const postRow = document.querySelector(
      `.post-row[data-post-id="${postId}"]`
    );
    if (postRow) {
      postRow.remove();
    }

    // Check if there are any posts left
    const postsContainer = document.querySelector(
      "#postings .data-table tbody"
    );
    if (postsContainer && postsContainer.children.length === 0) {
      // Show empty state
      const tableContainer = document.querySelector(
        "#postings .table-responsive"
      );
      tableContainer.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
          </svg>
          <h3>Henüz gönderi yok</h3>
          <p>Takas yapmaya başlamak için ilk gönderinizi oluşturun</p>
          <a href="/posting" class="button button-primary">Gönderi Oluştur</a>
        </div>
      `;
    }

    showNotification("Gönderi başarıyla silindi", "success");
  } catch (error) {
    console.error("Error deleting post:", error);
    showNotification("Gönderi silinemedi", "error");
  } finally {
    hideLoadingState();
  }
}

/**
 * Send request to delete user's profile photo
 */
async function deleteProfilePhoto() {
  const deleteBtn = document.getElementById("delete-profile-photo-btn");
  try {
    showLoadingState();

    const response = await fetch("/api/user/profile-picture", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Profil fotoğrafı silinemedi" }));
      throw new Error(errorData.message || "Profil fotoğrafı silinemedi");
    }

    // Update dashboard profile avatar
    const profileAvatarContainer = document.querySelector(".profile-avatar");
    if (profileAvatarContainer) {
      const userFirstName = document.body.dataset.userFirstname || 'K';
      const userLastName = document.body.dataset.userLastname || ' ';
      profileAvatarContainer.innerHTML = `
        <div class="avatar-placeholder">
          ${userFirstName.charAt(0).toUpperCase()}${userLastName.charAt(0).toUpperCase().trim()}
        </div>`;
    }

    // Update header profile avatar
    const headerUserAvatarContainer = document.querySelector('.user-button .user-avatar');
    if (headerUserAvatarContainer) {
      const userFirstName = document.body.dataset.userFirstname || 'K';
      const userLastName = document.body.dataset.userLastname || ' ';
      headerUserAvatarContainer.innerHTML = `
        <div class="avatar-placeholder">
          ${userFirstName.charAt(0).toUpperCase()}${userLastName.charAt(0).toUpperCase().trim()}
        </div>`;
    }

    // Remove the delete button
    if (deleteBtn) {
      deleteBtn.remove();
    }

    showNotification("Profil fotoğrafı başarıyla silindi", "success");

  } catch (error) {
    console.error("Error deleting profile photo:", error);
    showNotification(error.message || "Profil fotoğrafı silinirken bir hata oluştu", "error");
  } finally {
    hideLoadingState();
  }
}



/**
 * Send request to delete a draft
 * @param {string} draftId - The ID of the draft to delete
 */
async function deleteDraft(draftId) {
  try {
    showLoadingState();

    const response = await fetch(`/api/posts/${draftId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Taslak silinemedi");
    }

    // Remove the draft row
    const draftRow = document.querySelector(
      `.draft-row[data-post-id="${draftId}"]`
    );
    if (draftRow) {
      draftRow.remove();
    }

    // Check if there are any drafts left
    const draftsContainer = document.querySelector("#drafts .data-table tbody");
    if (draftsContainer && draftsContainer.children.length === 0) {
      // Show empty state
      const tableContainer = document.querySelector(
        "#drafts .table-responsive"
      );
      tableContainer.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <h3>Kaydedilmiş taslak yok</h3>
          <p>Kaydettiğiniz taslaklar burada görünecek</p>
        </div>
      `;
    }

    showNotification("Taslak başarıyla silindi", "success");
  } catch (error) {
    console.error("Error deleting draft:", error);
    showNotification("Taslak silinemedi", "error");
  } finally {
    hideLoadingState();
  }
}

/**
 * Send request to remove a post from favorites
 * @param {string} postId - The ID of the post to remove from favorites
 */
async function removeFromFavorites(postId) {
  try {
    showLoadingState();

    // Use the new favorite toggle endpoint with POST method
    const response = await fetch(`/api/posts/${postId}/favorite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Favorilerden kaldırılamadı");
    }

    // Remove the favorite row
    const favoriteRow = document.querySelector(
      `#favorites .post-row[data-post-id="${postId}"]`
    );
    if (favoriteRow) {
      favoriteRow.remove();
    }

    // Check if there are any favorites left
    const favoritesContainer = document.querySelector(
      "#favorites .data-table tbody"
    );
    if (favoritesContainer && favoritesContainer.children.length === 0) {
      // Show empty state
      const tableContainer = document.querySelector(
        "#favorites .table-responsive"
      );
      tableContainer.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"></path>
          </svg>
          <h3>Henüz favori yok</h3>
          <p>Favori olarak işaretlediğiniz ürünler burada görünecek</p>
          <a href="/find-posts" class="button button-primary">Ürünlere Göz At</a>
        </div>
      `;
    }

    showNotification("Favorilerden kaldırıldı", "success");
  } catch (error) {
    console.error("Error removing from favorites:", error);
    showNotification("Favorilerden kaldırılamadı", "error");
  } finally {
    hideLoadingState();
  }
}

/**
 * Initialize profile photo upload and cropping functionality
 */
function initProfilePhoto() {
  // Elements
  const uploadBtn = document.getElementById("upload-photo-btn");
  const fileInput = document.getElementById("profile-photo-input");
  const cropperModal = document.getElementById("photo-cropper-modal");
  const closeCropperBtn = document.getElementById("close-cropper");
  const cancelCropBtn = document.getElementById("cancel-crop");
  const applyCropBtn = document.getElementById("apply-crop");
  const imageToCrop = document.getElementById("image-to-crop");

  let cropper = null;
  let currentImageFile = null;

  // Open file dialog when upload button is clicked
  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      fileInput.click();
    });
  }

  // Handle file selection
  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const fileType = file.type;
        if (!fileType.startsWith("image/")) {
          showNotification("Lütfen bir resim dosyası seçin", "error");
          return;
        }
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
          showNotification("Resim dosyası boyutu 5MB'den küçük olmalıdır", "error");
          return;
        }
        openImageCropper(file);
      }
    });
  }

  // Event delegation for the delete profile photo button
  const profileAvatarContainer = document.querySelector(".profile-avatar-container");
  if (profileAvatarContainer) {
    profileAvatarContainer.addEventListener("click", function(event) {
      if (event.target.closest("#delete-profile-photo-btn")) {
        if (confirm("Profil fotoğrafınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
          deleteProfilePhoto();
        }
      }
    });
  }

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
          aspectRatio: 1, // Force 1:1 aspect ratio for profile photo
          viewMode: 1, // Restrict the crop box to not exceed the size of the canvas
          dragMode: "move", // Move the canvas by default instead of crop
          autoCropArea: 0.9, // The size of the crop box relative to the canvas size (0.9 = 90%)
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

  // Apply crop and update profile photo
  function applyImageCrop() {
    if (!cropper) {
      closeCropper();
      return;
    }

    // Show loading state
    showLoadingState();

    // Get a canvas with the cropped image
    const canvas = cropper.getCroppedCanvas({
      width: 400, // Set width of output for consistent size
      height: 400, // Set height of output for consistent size
      fillColor: "#fff", // Fill color for transparent areas
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    // Generate data URL from canvas with high quality
    const croppedImageDataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // Send the cropped image to the server
    uploadProfilePhoto(croppedImageDataUrl);

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
    if (fileInput) fileInput.value = "";
    currentImageFile = null;
  }

  if (closeCropperBtn) closeCropperBtn.addEventListener("click", closeCropper);
  if (cancelCropBtn) cancelCropBtn.addEventListener("click", closeCropper);
  if (applyCropBtn) applyCropBtn.addEventListener("click", applyImageCrop);

  // Upload profile photo to the server
  async function uploadProfilePhoto(dataUrl) {
    try {
      // Convert data URL to blob
      const blob = dataURLtoBlob(dataUrl);

      // Create form data for the image upload
      const formData = new FormData();
      formData.append("image", blob, "profile.jpg");

      // Step 1: Upload the image to Cloudinary using the existing route
      const uploadResponse = await fetch("/api/posts/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error("Profil resmi yüklenemedi (adım 1)");
      const uploadData = await uploadResponse.json();
      if (!uploadData.success) throw new Error(uploadData.error || "Resim yükleme başarısız (adım 1)");

      const updateResponse = await fetch("/api/user/profile-picture", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: uploadData.data.url, publicId: uploadData.data.public_id }),
      });
      if (!updateResponse.ok) throw new Error("Profil resmi güncellenemedi (adım 2)");
      // const userData = await updateResponse.json(); // Not strictly needed for UI update if backend confirms

      // Update dashboard profile avatar
      const dashboardAvatarImg = document.querySelector(".profile-avatar img");
      const dashboardAvatarPlaceholder = document.querySelector(".profile-avatar .avatar-placeholder");
      if (dashboardAvatarImg) {
        dashboardAvatarImg.src = uploadData.data.url;
      } else if (dashboardAvatarPlaceholder) {
        dashboardAvatarPlaceholder.remove();
        const newImg = document.createElement("img");
        newImg.src = uploadData.data.url;
        newImg.alt = "Profil Resmi";
        document.querySelector(".profile-avatar").appendChild(newImg);
      }

      // Update header avatar
      const headerUserAvatarContainer = document.querySelector(".user-button .user-avatar");
      if (headerUserAvatarContainer) {
        let headerImg = headerUserAvatarContainer.querySelector("img");
        if (headerImg) {
          headerImg.src = uploadData.data.url;
        } else {
          headerUserAvatarContainer.innerHTML = ''; // Clear placeholder (e.g., initials div)
          headerImg = document.createElement('img');
          headerImg.src = uploadData.data.url;
          const userFirstName = document.body.dataset.userFirstname || 'Kullanıcı';
          headerImg.alt = `${userFirstName} profili`;
          headerUserAvatarContainer.appendChild(headerImg);
        }
      }

      // Dynamically add or ensure visibility of the delete button
      const buttonsContainer = document.querySelector(".profile-avatar-container"); // Parent of the buttons
      if (buttonsContainer) {
        let deleteBtn = document.getElementById("delete-profile-photo-btn");
        if (!deleteBtn) {
          deleteBtn = document.createElement("button");
          deleteBtn.id = "delete-profile-photo-btn";
          deleteBtn.className = "button button-small button-danger profile-action-button";
          deleteBtn.style.marginTop = "8px";
          deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Profil Fotoğrafını Sil
          `;
          const uploadPhotoButton = document.getElementById('upload-photo-btn');
          if (uploadPhotoButton && uploadPhotoButton.parentNode === buttonsContainer) {
            uploadPhotoButton.after(deleteBtn);
          } else {
            buttonsContainer.appendChild(deleteBtn); // Fallback
          }
        } else {
          deleteBtn.style.display = ''; 
          deleteBtn.className = "button button-small button-danger profile-action-button"; // Ensure styles are correct
        }
      }

      showNotification("Profil resmi başarıyla güncellendi", "success");

    } catch (error) {
      console.error("Error uploading profile picture:", error);
      showNotification(error.message || "Profil resmi güncellenemedi", "error");
    } finally {
      hideLoadingState();
    }
  }

  function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(";base64,");
    const contentType = parts[0].split(":")[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }
}

/**
 * Initialize username editing functionality
 */
function initUsernameEdit() {
  const editBtn = document.getElementById("edit-username-btn");
  const usernameValue = document.getElementById("username-value");
  const editContainer = document.getElementById("username-edit-container");
  const usernameInput = document.getElementById("username-edit");
  const saveBtn = document.getElementById("save-username");
  const cancelBtn = document.getElementById("cancel-username-edit");

  // Show the edit form
  editBtn.addEventListener("click", function () {
    usernameValue.style.display = "none";
    editBtn.style.display = "none";
    editContainer.style.display = "block";
    usernameInput.focus();
  });

  // Cancel editing
  cancelBtn.addEventListener("click", function () {
    usernameValue.style.display = "inline";
    editBtn.style.display = "inline-block";
    editContainer.style.display = "none";
    usernameInput.value = usernameValue.textContent;
  });

  // Save new username
  saveBtn.addEventListener("click", function () {
    const newUsername = usernameInput.value.trim();

    if (newUsername === usernameValue.textContent) {
      // No change, just cancel
      cancelBtn.click();
      return;
    }

    if (!newUsername) {
      showNotification("Username cannot be empty", "error");
      return;
    }

    updateUsername(newUsername);
  });
}

/**
 * Send request to update username
 * @param {string} newUsername - The new username
 */
async function updateUsername(newUsername) {
  try {
    showLoadingState();

    const response = await fetch("/api/user/username", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: newUsername }),
    });

    if (!response.ok) {
      // Handle specific errors like duplicate username
      const data = await response.json();
      throw new Error(data.message || "Failed to update username");
    }

    // Update the username display
    document.getElementById("username-value").textContent = newUsername;
    document.querySelector(".profile-username").textContent = `@${newUsername}`;

    // Hide the edit form
    document.getElementById("username-value").style.display = "inline";
    document.getElementById("edit-username-btn").style.display = "inline-block";
    document.getElementById("username-edit-container").style.display = "none";

    showNotification("Username updated successfully", "success");
  } catch (error) {
    console.error("Error updating username:", error);
    showNotification(error.message || "Failed to update username", "error");
  } finally {
    hideLoadingState();
  }
}

/**
 * Show a notification message
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('info', 'success', 'error')
 */
function showNotification(message, type = "info") {
  // Check if a notification already exists, remove if it does
  let notification = document.querySelector(".notification");
  if (notification) {
    notification.remove();
  }

  // Create a new notification
  notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // Add to the document
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Auto-hide after a delay
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * Show a loading spinner overlay
 */
function showLoadingState() {
  // Check if a loader already exists
  if (document.querySelector(".loading-overlay")) {
    return;
  }

  // Create a loading overlay
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.innerHTML = '<div class="loading-spinner"></div>';
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(255, 255, 255, 0.7)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";

  // Style the spinner
  const spinner = overlay.querySelector(".loading-spinner");
  spinner.style.width = "40px";
  spinner.style.height = "40px";
  spinner.style.borderWidth = "4px";
  spinner.style.borderTopColor = "var(--primary)";

  // Add to the document
  document.body.appendChild(overlay);

  return overlay;
}

/**
 * Hide the loading spinner overlay
 * @param {HTMLElement} loader - The loading overlay element (optional)
 */
function hideLoadingState(loader) {
  // If a specific loader is provided, remove it
  if (loader) {
    loader.remove();
    return;
  }

  // Otherwise remove all loaders
  const loaders = document.querySelectorAll(".loading-overlay");
  loaders.forEach((loader) => loader.remove());
}

/**
 * Initialize privacy settings toggle functionality
 */
function initPrivacySettings() {
  const showUsernameToggle = document.getElementById("show-username-toggle");

  if (showUsernameToggle) {
    showUsernameToggle.addEventListener("change", async function () {
      try {
        showLoadingState();

        const response = await fetch("/api/user/privacy", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ showUsername: this.checked }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to update privacy settings");
        }

        showNotification(
          this.checked
            ? "Your profile will now only show your username to others"
            : "Your profile will now show your full name to others",
          "success"
        );
      } catch (error) {
        console.error("Error updating privacy settings:", error);
        showNotification(
          error.message || "Failed to update privacy settings",
          "error"
        );

        // Reset the checkbox to its previous state
        this.checked = !this.checked;
      } finally {
        hideLoadingState();
      }
    });
  }
}

/**
 * Initialize account deletion functionality
 */
function initAccountDeletion() {
  // Elements
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  const deleteAccountModal = document.getElementById("delete-account-modal");
  const closeDeleteModalBtn = document.getElementById("close-delete-modal");
  const cancelDeleteBtn = document.getElementById("cancel-delete-account");
  const confirmDeleteBtn = document.getElementById("confirm-delete-account");
  const confirmationInput = document.getElementById("delete-confirmation-input");

  if (!deleteAccountBtn || !deleteAccountModal) return;

  // Open the delete account modal
  deleteAccountBtn.addEventListener("click", function () {
    deleteAccountModal.classList.add("active");
    document.body.classList.add("modal-open");
    confirmationInput.value = ""; // Clear any previous input
    confirmDeleteBtn.disabled = true; // Disable confirm button initially
  });

  // Close the delete account modal
  function closeDeleteModal() {
    deleteAccountModal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }

  // Close modal event listeners
  closeDeleteModalBtn.addEventListener("click", closeDeleteModal);
  cancelDeleteBtn.addEventListener("click", closeDeleteModal);

  // Validate confirmation input
  confirmationInput.addEventListener("input", function () {
    // Enable the confirm button only if the input matches exactly "hesabı sil"
    confirmDeleteBtn.disabled = this.value.toLowerCase() !== "hesabı sil";
  });

  // Handle account deletion
  confirmDeleteBtn.addEventListener("click", async function () {
    if (confirmationInput.value.toLowerCase() !== "hesabı sil") {
      showNotification("Lütfen 'hesabı sil' yazarak onaylayın", "error");
      return;
    }

    try {
      showLoadingState();

      const response = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Hesap silinemedi");
      }

      // On successful deletion, redirect to home page
      showNotification("Hesabınız başarıyla silindi", "success");
      
      // Wait a moment to show the success message before redirecting
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
      
    } catch (error) {
      console.error("Error deleting account:", error);
      showNotification(error.message || "Hesap silinemedi", "error");
      closeDeleteModal();
    } finally {
      hideLoadingState();
    }
  });
}

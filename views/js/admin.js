document.addEventListener("DOMContentLoaded", () => {
  // --- User Deletion --- //
  const usersTable = document.getElementById("users-table");
  if (usersTable) {
    usersTable.addEventListener("click", async (event) => {
      if (event.target.classList.contains("btn-delete-user")) {
        const button = event.target;
        const userId = button.dataset.id;

        if (
          confirm(
            `Bu kullanıcıyı silmek istediğinizden emin misiniz (ID: ${userId})? Bu işlem geri alınamaz.`
          )
        ) {
          try {
            const response = await fetch(`/admin/users/${userId}`, {
              method: "DELETE",
            });
            const result = await response.json();

            if (response.ok && result.success) {
              // Remove the user's row from the table
              const row = button.closest("tr");
              row.remove();
              alert(result.message || "Kullanıcı başarıyla silindi.");
            } else {
              alert(result.message || "Kullanıcı silinemedi.");
            }
          } catch (error) {
            console.error("Error deleting user:", error);
            alert("Kullanıcıyı silmeye çalışırken bir hata oluştu.");
          }
        }
      }
    });
  }

  // --- User Messages Modal Logic ---
  const userMessagesModalEl = document.getElementById('userMessagesModal');
  if (userMessagesModalEl) {
    const userMessagesModal = new bootstrap.Modal(userMessagesModalEl);
    const userMessagesTableBody = document.getElementById('userMessagesTableBody');
    const userMessagesModalLabel = document.getElementById('userMessagesModalLabel');

    document.querySelectorAll('.view-messages-btn').forEach(button => {
      button.addEventListener('click', async (event) => {
        const userId = event.currentTarget.dataset.userId;
        const userName = event.currentTarget.dataset.userName;

        // Update modal title
        userMessagesModalLabel.textContent = `Messages from ${userName}`;

        try {
          const response = await fetch(`/admin/users/${userId}/messages`);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();

          // Clear previous messages
          userMessagesTableBody.innerHTML = '';

          if (data.success && data.messages.length > 0) {
            data.messages.forEach(msg => {
              // Format timestamp: DD/MM/YY HH:MM
              const d = new Date(msg.timestamp);
              const formattedDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;
              const formattedTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
              const formattedTimestamp = `${formattedDate} ${formattedTime}`;

              const row = `
                <tr>
                  <td>${msg.postName}</td>
                  <td>${msg.message}</td>
                  <td>${formattedTimestamp}</td>
                  <td>${msg.sentBy}</td>
                  <td>${msg.sentTo}</td>
                  <td>
                    <button class="btn btn-danger btn-sm btn-delete-message" data-message-id="${msg.messageId}">Delete</button>
                  </td>
                </tr>
              `;
              userMessagesTableBody.insertAdjacentHTML('beforeend', row);
            });
          } else {
            const noMessagesRow = `<tr><td colspan="6" class="text-center">No messages found for this user.</td></tr>`;
            userMessagesTableBody.innerHTML = noMessagesRow;
          }

          // Show the modal
          userMessagesModal.show();

          // Add a single event listener to the table body for deleting messages
          const tableBody = document.getElementById('userMessagesTableBody');
          if (!tableBody.dataset.listenerAttached) {
            tableBody.addEventListener('click', async (event) => {
              if (event.target.classList.contains('btn-delete-message')) {
                const messageId = event.target.getAttribute('data-message-id');
                if (confirm('Are you sure you want to delete this message?')) {
                  try {
                    const response = await fetch(`/admin/messages/${messageId}`, {
                      method: 'DELETE',
                    });
                    const result = await response.json();
                    if (result.success) {
                      event.target.closest('tr').remove(); // Remove the row from the table
                    } else {
                      alert('Failed to delete message: ' + result.error);
                    }
                  } catch (err) {
                    console.error('Error deleting message:', err);
                    alert('An error occurred while deleting the message.');
                  }
                }
              }
            });
            tableBody.dataset.listenerAttached = 'true';
          }
        } catch (error) {
          console.error('Error fetching user messages:', error);
          alert('Failed to load user messages. Please check the console for details.');
        }
      });
    });
  }
  // --- End User Messages Modal Logic ---

  // --- Post Deletion --- //
  const postsTableElement = document.getElementById("posts-table"); // Renamed to avoid conflict
  if (postsTableElement) {
    postsTableElement.addEventListener("click", async (event) => {
      if (event.target.classList.contains("btn-delete-post")) {
        const button = event.target;
        const postId = button.dataset.id;

        if (
          confirm(
            `Bu gönderiyi silmek istediğinizden emin misiniz (ID: ${postId})? Bu işlem geri alınamaz.`
          )
        ) {
          try {
            const response = await fetch(`/admin/posts/${postId}`, {
              method: "DELETE",
            });
            const result = await response.json();

            if (response.ok && result.success) {
              const row = button.closest("tr");
              row.remove();
              alert(result.message || "Gönderi başarıyla silindi.");
            } else {
              alert(result.message || "Gönderi silinemedi.");
            }
          } catch (error) {
            console.error("Error deleting post:", error);
            alert("Gönderiyi silmeye çalışırken bir hata oluştu.");
          }
        }
      }
    });
  }

  // --- Post Click to Redirect --- //
  const postsTable = document.getElementById("posts-table");
  if (postsTable) {
    postsTable.addEventListener("click", (event) => {
      // Check if the click is on a cell within a post row, specifically the title cell
      const targetCell = event.target.closest("td.post-title-link");
      if (targetCell) {
        const postId = targetCell.dataset.postid;
        if (postId) {
          window.location.href = `/posts/${postId}`;
        }
      }
    });
  }

  // --- Auto-submit for Post Sort Form --- //
  const sortPostsBySelect = document.getElementById("sortPostsBy");
  if (sortPostsBySelect) {
    sortPostsBySelect.addEventListener("change", function () {
      // Find the closest form parent and submit it
      const sortForm = this.closest("form");
      if (sortForm) {
        sortForm.submit();
      }
    });
  }

  // --- Waiting Posts Management --- //
  const waitingPostsTableBody = document.querySelector("#waiting-posts-table tbody");
  const noWaitingPostsRow = document.getElementById("no-waiting-posts-row");

  async function fetchWaitingPosts() {
    try {
      const response = await fetch("/admin/posts/waiting");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        displayWaitingPosts(result.data);
      } else {
        console.error("Failed to fetch waiting posts:", result.message);
        displayWaitingPosts([]); // Display empty state
      }
    } catch (error) {
      console.error("Error fetching waiting posts:", error);
      displayWaitingPosts([]); // Display empty state on error
      alert("Bekleyen ilanlar yüklenirken bir hata oluştu.");
    }
  }

  function displayWaitingPosts(posts) {
    if (!waitingPostsTableBody || !noWaitingPostsRow) {
      console.error("Waiting posts table elements not found.");
      return;
    }

    // Clear existing rows except the 'no posts' template row
    waitingPostsTableBody.innerHTML = ''; 
    waitingPostsTableBody.appendChild(noWaitingPostsRow); // Re-add template row, will be hidden if posts exist

    if (posts.length === 0) {
      noWaitingPostsRow.style.display = ''; // Show the 'no posts' message
      return;
    }

    noWaitingPostsRow.style.display = 'none'; // Hide the 'no posts' message

    posts.forEach(post => {
      const row = document.createElement("tr");
      row.dataset.postId = post._id;

      // Images (Display up to 3 thumbnails)
      const imagesCell = document.createElement("td");
      const imagesContainer = document.createElement("div");
      imagesContainer.style.display = "flex";
      imagesContainer.style.gap = "5px"; // Space between images
      imagesContainer.style.alignItems = "center";

      if (post.images && post.images.length > 0) {
        post.images.slice(0, 3).forEach(image => { // Show up to 3 images
          if (image.url) {
            const img = document.createElement("img");
            img.src = image.url;
            img.alt = post.title.substring(0, 15) + "..."; // Shortened alt text
            img.classList.add("admin-table-image");
            img.style.width = "50px"; // Smaller thumbnails for multiple images
            img.style.height = "50px";
            img.style.objectFit = "cover";
            imagesContainer.appendChild(img);
          }
        });
        if (post.images.length > 3) {
          const moreImagesText = document.createElement("span");
          moreImagesText.textContent = `+${post.images.length - 3}`;
          moreImagesText.style.marginLeft = "5px";
          imagesContainer.appendChild(moreImagesText);
        }
        imagesCell.appendChild(imagesContainer);
      } else {
        imagesCell.textContent = "No Image";
      }
      row.appendChild(imagesCell);

      // Status (New Cell)
      const statusCell = document.createElement("td");
      const statusBold = document.createElement("strong");
      statusBold.textContent = post.status ? post.status.charAt(0).toUpperCase() + post.status.slice(1) : "N/A"; // Capitalize first letter
      statusCell.appendChild(statusBold);
      row.appendChild(statusCell);

      // Title
      const titleCell = document.createElement("td");
      titleCell.textContent = post.title;
      row.appendChild(titleCell);

      // Category
      const categoryCell = document.createElement("td");
      categoryCell.textContent = post.category;
      row.appendChild(categoryCell);

      // Condition (New Cell)
      const conditionCell = document.createElement("td");
      const conditionMap = {
        "new": "Yeni",
        "used-like-new": "Yeni Gibi",
        "used-good": "İyi Durumda",
        "used-fair": "İdare Eder"
      };
      conditionCell.textContent = conditionMap[post.condition] || post.condition || "Belirtilmemiş";
      row.appendChild(conditionCell);

      // Location
      const locationCell = document.createElement("td");
      let locationText = "N/A";
      if (post.location) {
        locationText = [
          post.location.city,
          post.location.district,
          post.location.neighborhood,
        ].filter(Boolean).join(", ");
      }
      locationCell.textContent = locationText || "N/A";
      row.appendChild(locationCell);

      // Submitted Date
      const submittedDateCell = document.createElement("td");
      submittedDateCell.textContent = new Date(post.createdAt).toLocaleDateString();
      row.appendChild(submittedDateCell);

      // Author
      const authorCell = document.createElement("td");
      authorCell.textContent = post.createdBy ? `${post.createdBy.username} (${post.createdBy.email || 'No email'})` : "Unknown";
      row.appendChild(authorCell);

      // Description (Snippet)
      const descriptionCell = document.createElement("td");
      descriptionCell.textContent = post.description || "N/A";
      descriptionCell.style.whiteSpace = "normal"; // Allow description to wrap
      row.appendChild(descriptionCell);

      // Contact Info (Corrected)
      const contactCell = document.createElement("td");
      let contactParts = [];
      // Display the post's own contact preferences and details
      if (post.contactPreferences && post.contactPreferences.length > 0) {
        const preferencesDisplay = post.contactPreferences.map(pref => {
          if (pref === 'in-app') return 'Uygulama İçi Mesaj';
          if (pref === 'email') return 'E-posta';
          if (pref === 'phone') return 'Telefon';
          return pref;
        }).join(', ');
        contactParts.push(`Tercihler: ${preferencesDisplay}`);

        if (post.contactPreferences.includes("phone") && post.contactDetails && post.contactDetails.phone) {
          contactParts.push(`Telefon: ${post.contactDetails.phone}`);
        }
        if (post.contactPreferences.includes("email")) {
          if (post.contactDetails && post.contactDetails.email) {
            contactParts.push(`E-posta: ${post.contactDetails.email}`);
          } else if (post.createdBy && post.createdBy.email) {
            // Fallback to the user's primary email if 'email' was a preference but no specific post email was given in contactDetails
            contactParts.push(`E-posta (Kullanıcı): ${post.createdBy.email}`);
          }
        }
      } else if (post.createdBy && post.createdBy.email) {
        // Default to user's email if no preferences are set but user email exists (e.g. for older posts or as a fallback)
         contactParts.push(`Varsayılan E-posta (Kullanıcı): ${post.createdBy.email}`);
      }

      if (contactParts.length > 0) {
        contactCell.innerHTML = contactParts.join("<br>"); // Use innerHTML for line breaks
      } else {
        contactCell.textContent = "N/A";
      }
      contactCell.style.whiteSpace = "normal"; // Allow wrapping for better readability
      contactCell.style.minWidth = "180px"; // Ensure enough space for contact details
      row.appendChild(contactCell);

      // Actions (Publish/Delete Buttons)
      const actionsCell = document.createElement("td");
      const publishButton = document.createElement("button");
      publishButton.textContent = "Publish";
      publishButton.classList.add("btn-publish-waiting-post");
      publishButton.dataset.id = post._id;
      actionsCell.appendChild(publishButton);

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "Delete";
      deleteButton.classList.add("btn-delete-waiting-post", "btn-danger"); // Added btn-danger for styling
      deleteButton.dataset.id = post._id;
      actionsCell.appendChild(deleteButton);
      row.appendChild(actionsCell);

      waitingPostsTableBody.appendChild(row);
    });
  }

  // Initial fetch of waiting posts
  if (document.getElementById("waiting-posts-table")) {
    fetchWaitingPosts();
  }

  async function handlePublishPost(postId) {
    if (!confirm(`Bu ilanı yayınlamak istediğinizden emin misiniz (ID: ${postId})?`)) {
      return;
    }
    try {
      const response = await fetch(`/admin/posts/${postId}/approve`, {
        method: "PATCH",
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(result.message || "İlan başarıyla yayınlandı.");
        // Remove the row from the waiting table or refresh
        const rowToRemove = waitingPostsTableBody.querySelector(`tr[data-post-id="${postId}"]`);
        if (rowToRemove) rowToRemove.remove();
        // Check if no posts are left and show the 'no posts' message
        if (waitingPostsTableBody.querySelectorAll('tr:not(#no-waiting-posts-row)').length === 0) {
          noWaitingPostsRow.style.display = '';
        }
      } else {
        alert(result.message || "İlan yayınlanamadı.");
      }
    } catch (error) {
      console.error("Error publishing post:", error);
      alert("İlanı yayınlarken bir hata oluştu.");
    }
  }

  async function handleDeleteWaitingPost(postId) {
    if (!confirm(`Bu bekleyen ilanı silmek istediğinizden emin misiniz (ID: ${postId})? Bu işlem geri alınamaz.`)) {
      return;
    }
    try {
      // This uses the same admin delete endpoint as regular posts, which handles images/messages
      const response = await fetch(`/admin/posts/${postId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(result.message || "Bekleyen ilan başarıyla silindi.");
        // Remove the row from the waiting table
        const rowToRemove = waitingPostsTableBody.querySelector(`tr[data-post-id="${postId}"]`);
        if (rowToRemove) rowToRemove.remove();
        // Check if no posts are left and show the 'no posts' message
        if (waitingPostsTableBody.querySelectorAll('tr:not(#no-waiting-posts-row)').length === 0) {
          noWaitingPostsRow.style.display = '';
        }
      } else {
        alert(result.message || "Bekleyen ilan silinemedi.");
      }
    } catch (error) {
      console.error("Error deleting waiting post:", error);
      alert("Bekleyen ilanı silerken bir hata oluştu.");
    }
  }

  if (waitingPostsTableBody) {
    waitingPostsTableBody.addEventListener("click", async (event) => {
      if (event.target.classList.contains("btn-publish-waiting-post")) {
        const postId = event.target.dataset.id;
        await handlePublishPost(postId);
      }
      if (event.target.classList.contains("btn-delete-waiting-post")) {
        const postId = event.target.dataset.id;
        await handleDeleteWaitingPost(postId);
      }
    });
  }

});

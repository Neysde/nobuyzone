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
            `Are you sure you want to delete this user (ID: ${userId})? This action cannot be undone.`
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
              alert(result.message || "User deleted successfully.");
            } else {
              alert(result.message || "Failed to delete user.");
            }
          } catch (error) {
            console.error("Error deleting user:", error);
            alert("An error occurred while trying to delete the user.");
          }
        }
      }
    });
  }

  // --- Post Deletion --- //
  const postsTableElement = document.getElementById("posts-table"); // Renamed to avoid conflict
  if (postsTableElement) {
    postsTableElement.addEventListener("click", async (event) => {
      if (event.target.classList.contains("btn-delete-post")) {
        const button = event.target;
        const postId = button.dataset.id;

        if (
          confirm(
            `Are you sure you want to delete this post (ID: ${postId})? This action cannot be undone.`
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
              alert(result.message || "Post deleted successfully.");
            } else {
              alert(result.message || "Failed to delete post.");
            }
          } catch (error) {
            console.error("Error deleting post:", error);
            alert("An error occurred while trying to delete the post.");
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
});

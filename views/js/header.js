/**
 * Header dropdown functionality
 * This script handles toggling the user dropdown menu
 * for better accessibility and mobile experience
 */

// Global mobile layout handler function
window.handleMobileLayout = function () {};

document.addEventListener("DOMContentLoaded", function () {
  // Get the user button and dropdown elements
  const userDropdown = document.querySelector(".user-dropdown");
  const userButton = document.querySelector(".user-button");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const logoutLink = document.querySelector("#logout-link");
  const notificationBell = document.querySelector(".notification-bell");

  /**
   * Attach event listeners to elements (both original and cloned)
   * @param {HTMLElement} element - The element to attach listeners to
   */
  function attachEventListeners(element) {
    if (element.classList.contains("notification-bell")) {
      // Notification bell event handling
      element.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = element.getAttribute("href");
        }
      });

      element.setAttribute("role", "button");
      element.setAttribute("aria-label", "Bildirimler");

      element.addEventListener("click", function (e) {
        // Don't prevent default - we still want to navigate

        // Reset unread badge since we're going to the messages section
        if (typeof notificationSocket !== "undefined" && notificationSocket) {
          setTimeout(() => {
            // Try to clear unread messages when the bell is clicked
            const badge = document.getElementById("unread-badge");
            if (badge) {
              badge.style.display = "none";
            }

            const bells = document.querySelectorAll(".notification-bell");
            bells.forEach((bell) => {
              bell.classList.remove("has-unread");
            });
          }, 100);
        }
      });
    } else if (element.classList.contains("user-dropdown")) {
      // Get the user button in this dropdown
      const dropdownButton = element.querySelector(".user-button");
      const menu = element.querySelector(".dropdown-menu");

      if (dropdownButton && menu) {
        let isDropdownOpen = false;
        let leaveTimer;

        // Toggle dropdown on button click
        dropdownButton.addEventListener("click", function (e) {
          if (!menu.classList.contains("show") || window.innerWidth <= 768) {
            e.preventDefault();
            isDropdownOpen = !isDropdownOpen;
            menu.classList.toggle("show");
          }
        });

        // Handle mouse interactions
        element.addEventListener("mouseenter", function () {
          clearTimeout(leaveTimer);
          menu.classList.add("show");
          isDropdownOpen = true;
        });

        element.addEventListener("mouseleave", function () {
          leaveTimer = setTimeout(function () {
            menu.classList.remove("show");
            isDropdownOpen = false;
          }, 300);
        });

        // Find logout link in this dropdown
        const logoutLinkInDropdown = element.querySelector("#logout-link");
        if (logoutLinkInDropdown) {
          logoutLinkInDropdown.addEventListener("click", handleLogout);
        }
      }
    }
  }

  /**
   * Handle logout functionality
   * @param {Event} e - Click event
   */
  async function handleLogout(e) {
    e.preventDefault();
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        // Redirect to home page after successful logout
        window.location.href = "/";
      } else {
        console.error("Çıkış yapılamadı");
      }
    } catch (error) {
      console.error("Çıkış sırasında hata:", error);
    }
  }

  /**
   * Update the global mobile layout handler
   * Moves buttons to mobile container on smaller screens
   */
  window.handleMobileLayout = function () {
    const createPostBtn = document.getElementById("create-post-btn-main");
    const headerActions = document.querySelector(".header-actions");
    const mobileActions = document.querySelector(".mobile-actions");

    // Check if we're in mobile view
    if (window.innerWidth <= 768) {
      // Only move items if not already moved
      if (mobileActions && headerActions) {
        // Clear mobile actions first to prevent duplicates
        mobileActions.innerHTML = "";

        // Check if user is logged in (using userDropdown existence as indicator)
        if (userDropdown) {
          // USER IS LOGGED IN

          // Clone create post button for mobile
          if (createPostBtn) {
            const postBtnClone = createPostBtn.cloneNode(true);
            postBtnClone.textContent = '+'; // Change text to '+' for mobile
            postBtnClone.classList.add('create-post-button-mobile'); // Add a class for specific mobile styling
            mobileActions.appendChild(postBtnClone);
          }

          // Clone notification bell for mobile if it exists
          if (notificationBell) {
            // Deep clone to ensure all inner elements like badges are copied
            const bellClone = notificationBell.cloneNode(true);

            // Update the badge to match the current state
            const originalBadge = document.getElementById("unread-badge");
            if (originalBadge) {
              const mobileUnreadBadge = bellClone.querySelector(".unread-badge");
              mobileUnreadBadge.textContent = originalBadge.textContent;
              mobileUnreadBadge.style.display = originalBadge.style.display;
            }

            // Add to mobile container
            mobileActions.appendChild(bellClone);
            attachEventListeners(bellClone);
          }

          // Clone user dropdown for mobile if it exists
          if (userDropdown) {
            const userDropdownClone = userDropdown.cloneNode(true);
            mobileActions.appendChild(userDropdownClone);
            attachEventListeners(userDropdownClone);
          }
        } else {
          // USER IS NOT LOGGED IN

          // Clone login button for mobile
          // Find the login button in header actions (assuming it's the outline button)
          const loginBtn = headerActions.querySelector(".button-outline");
          
          if (loginBtn) {
            const loginBtnClone = loginBtn.cloneNode(true);
            // Ensure appropriate mobile styling if needed
            // The existing CSS for .mobile-actions .button should handle standard sizing
            mobileActions.appendChild(loginBtnClone);
          }
        }
      }
    } else {
      // Desktop view - clear mobile container
      if (mobileActions) {
        mobileActions.innerHTML = "";
      }
    }
  };

  // Run on initial load
  window.handleMobileLayout();

  // Run on window resize
  window.addEventListener("resize", window.handleMobileLayout);

  // Document click listener for closing dropdowns
  document.addEventListener("click", function (e) {
    const dropdowns = document.querySelectorAll(".user-dropdown");
    dropdowns.forEach((dropdown) => {
      if (!dropdown.contains(e.target)) {
        const menu = dropdown.querySelector(".dropdown-menu");
        if (menu) menu.classList.remove("show");
      }
    });
  });

  // Handle Escape key to close dropdowns
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const menus = document.querySelectorAll(".dropdown-menu.show");
      menus.forEach((menu) => {
        menu.classList.remove("show");
        const button = menu
          .closest(".user-dropdown")
          .querySelector(".user-button");
        if (button) button.focus();
      });
    }
  });

  // Attach event listeners to original elements
  if (notificationBell) {
    attachEventListeners(notificationBell);

    // Check for URL hash to see if we're on the messages tab
    if (window.location.hash === "#messages") {
      // If we're on the messages tab, manually trigger a check for unread messages
      // to update the badge immediately after possibly reading messages
      setTimeout(function () {
        if (typeof checkUnreadMessages === "function") {
          checkUnreadMessages();
        }
      }, 1000);
    }
  }

  if (userDropdown) {
    attachEventListeners(userDropdown);
  }

  // Handle logout functionality directly
  if (logoutLink) {
    logoutLink.addEventListener("click", handleLogout);
  }
});

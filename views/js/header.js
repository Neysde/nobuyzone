/**
 * Header dropdown functionality
 * This script handles toggling the user dropdown menu
 * for better accessibility and mobile experience
 */
document.addEventListener("DOMContentLoaded", function () {
  // Get the user button and dropdown elements
  const userDropdown = document.querySelector(".user-dropdown");
  const userButton = document.querySelector(".user-button");
  const dropdownMenu = document.querySelector(".dropdown-menu");
  const logoutLink = document.querySelector("#logout-link");
  const notificationBell = document.querySelector(".notification-bell");

  // Handle notification bell click for accessibility
  if (notificationBell) {
    notificationBell.addEventListener("keydown", function (e) {
      // Allow users to press Enter or Space to navigate to messages
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = notificationBell.getAttribute("href");
      }
    });

    // Add an extra role for screen readers
    notificationBell.setAttribute("role", "button");
    notificationBell.setAttribute("aria-label", "Notifications");

    // Add click handler to try to reset unread count
    notificationBell.addEventListener("click", function (e) {
      // Don't prevent default - we still want to navigate to the messages tab

      // Reset unread badge since we're going to the messages section
      if (typeof notificationSocket !== "undefined" && notificationSocket) {
        // Use setTimeout to ensure this happens after navigation
        setTimeout(() => {
          // Try to clear unread messages when the bell is clicked
          const badge = document.getElementById("unread-badge");
          if (badge) {
            badge.style.display = "none";
          }

          const bell = document.querySelector(".notification-bell");
          if (bell) {
            bell.classList.remove("has-unread");
          }
        }, 100);
      }
    });

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

  // Handle logout functionality
  if (logoutLink) {
    logoutLink.addEventListener("click", async function (e) {
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
          console.error("Logout failed");
        }
      } catch (error) {
        console.error("Error during logout:", error);
      }
    });
  }

  // Only proceed if both elements exist (user is logged in)
  if (userButton && dropdownMenu) {
    let isDropdownOpen = false;
    let leaveTimer;

    // Toggle dropdown on button click
    userButton.addEventListener("click", function (e) {
      // Don't prevent default if we're clicking a link and dropdown is open
      // This allows navigation to work when clicking the user button after opening the dropdown
      if (
        !dropdownMenu.classList.contains("show") ||
        window.innerWidth <= 768
      ) {
        e.preventDefault();
        isDropdownOpen = !isDropdownOpen;
        dropdownMenu.classList.toggle("show");
      }
    });

    // Handle mouse enter and leave with a delay to prevent accidental closing
    userDropdown.addEventListener("mouseenter", function () {
      clearTimeout(leaveTimer);
      dropdownMenu.classList.add("show");
      isDropdownOpen = true;
    });

    userDropdown.addEventListener("mouseleave", function () {
      leaveTimer = setTimeout(function () {
        dropdownMenu.classList.remove("show");
        isDropdownOpen = false;
      }, 300); // 300ms delay before hiding the dropdown
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", function (e) {
      if (!userDropdown.contains(e.target)) {
        dropdownMenu.classList.remove("show");
        isDropdownOpen = false;
      }
    });

    // Handle Escape key to close dropdown
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dropdownMenu.classList.contains("show")) {
        dropdownMenu.classList.remove("show");
        isDropdownOpen = false;
        userButton.focus(); // Return focus to button for better accessibility
      }
    });

    // Make dropdown menu items accessible via keyboard
    const dropdownLinks = dropdownMenu.querySelectorAll("a");
    dropdownLinks.forEach(function (link, index) {
      link.addEventListener("keydown", function (e) {
        // Move focus with arrow keys
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const nextLink = dropdownLinks[index + 1] || dropdownLinks[0];
          nextLink.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const prevLink =
            dropdownLinks[index - 1] || dropdownLinks[dropdownLinks.length - 1];
          prevLink.focus();
        }
      });
    });
  }
});

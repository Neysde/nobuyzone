/**
 * Authentication Pages js
 * Handles form submissions, validation, and notifications for login, register, and password reset pages
 */

document.addEventListener("DOMContentLoaded", () => {
  // Get the forms if they exist on the page
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const passwordResetRequestForm = document.getElementById(
    "password-reset-request-form"
  );
  const passwordResetForm = document.getElementById("password-reset-form");

  //Initialize forms with validation and submit handlers
  if (loginForm) initLoginForm(loginForm);
  if (registerForm) initRegisterForm(registerForm);
  if (passwordResetRequestForm)
    initPasswordResetRequestForm(passwordResetRequestForm);
  if (passwordResetForm) initPasswordResetForm(passwordResetForm);
});

/**
 * Initialize login form
 * @param {HTMLFormElement} form - The login form
 */
function initLoginForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); //prevents refreshing the page.

    //Get form data
    const email = form.querySelector("#email").value.trim();
    const password = form.querySelector("#password").value;

    //Validate form
    if (!validateEmail(email)) {
      showError("Please enter a valid email address");
      return; //it returns nothing but it stops the login process if the email is not valid.
    }

    if (!password) {
      showError("Please enter your password");
      return;
    }

    //Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    setLoading(submitBtn, true);

    try {
      //Send login request
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        //On success, show notification and redirect
        showNotification("Login successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "/"; //Redirect to homepage or dashboard WILL BE USED TO REDIRECT TO USER DASHBOARD
        }, 1500);
      } else {
        //Show error message
        showError(data.message || "Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      showError("An unexpected error occurred. Please try again later.");
    } finally {
      //Reset button state
      setLoading(submitBtn, false, originalBtnText);
    }
  });
}

/**
 * Initialize register form
 * @param {HTMLFormElement} form - The register form element
 */
function initRegisterForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form data
    const username = form.querySelector("#username").value.trim();
    const firstName = form.querySelector("#firstName").value.trim();
    const lastName = form.querySelector("#lastName").value.trim();
    const email = form.querySelector("#email").value.trim();
    const password = form.querySelector("#password").value;

    // Validate form
    if (!username || username.length < 3) {
      showError("Username must be at least 3 characters");
      return;
    }

    if (!firstName) {
      showError("Please enter your first name");
      return;
    }

    if (!lastName) {
      showError("Please enter your last name");
      return;
    }

    if (!validateEmail(email)) {
      showError("Please enter a valid email address");
      return;
    }

    if (!validatePassword(password)) {
      showError(
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      );
      return;
    }

    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    setLoading(submitBtn, true);

    try {
      //Send register request
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          firstName,
          lastName,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        //On success, show notification and redirect to verification page
        showNotification(
          data.message ||
            "Registration successful! Please check your email for verification mail.",
          "success"
        );
        //Clear the form
        form.reset();
      } else {
        //Show error message
        showError(data.message || "Registration failed. Please try again.");
      }
    } catch (error) {
      console.error("Register error:", error);
      showError("An unexpected error occurred. Please try again later.");
    } finally {
      //Reset button state
      setLoading(submitBtn, false, originalBtnText);
    }
  });
}

/**
 * Initialize password reset request form
 * @param {HTMLFormElement} form - The password reset request form element
 */
function initPasswordResetRequestForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    //Get form data
    const email = form.querySelector("#email").value.trim();

    //Validate form
    if (!validateEmail(email)) {
      showError("Please enter a valid email address");
      return;
    }

    //Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    setLoading(submitBtn, true);

    try {
      // Send password reset request
      const response = await fetch("/api/passwordreset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        // On success, show notification
        showNotification(
          data.message || "Password reset link has been sent to your email.",
          "success"
        );
        // Clear the form
        form.reset();
      } else {
        // Show error message
        showError(
          data.message ||
            "Failed to send password reset link. Please try again."
        );
      }
    } catch (error) {
      console.error("Password reset request error:", error);
      showError("An unexpected error occurred. Please try again later.");
    } finally {
      // Reset button state
      setLoading(submitBtn, false, originalBtnText);
    }
  });
}

/**
 * Initialize password reset form
 * @param {HTMLFormElement} form - The password reset form element
 */
function initPasswordResetForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get form data
    const password = form.querySelector("#password").value;

    // Validate form
    if (!validatePassword(password)) {
      showError(
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      );
      return;
    }

    //Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    setLoading(submitBtn, true);

    try {
      // The current page URL is of the form /reset/:id/:token, which is the target for the POST request.
      const targetUrl = window.location.pathname;

      // Send password reset request
      const response = await fetch(targetUrl, {
        // Use the current page's full path
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        //On success, show notification and redirect to login page
        showNotification(
          data.message || "Password has been reset successfully!",
          "success"
        );
        setTimeout(() => {
          window.location.href = "/api/login"; //Redirect to login page
        }, 1500);
      } else {
        //Show error message
        showError(
          data.message || "Failed to reset password. Please try again."
        );
      }
    } catch (error) {
      console.error("Password reset error:", error);
      showError("An unexpected error occurred. Please try again later.");
    } finally {
      //Reset button state
      setLoading(submitBtn, false, originalBtnText);
    }
  });
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} - Whether the email is valid
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @returns {boolean} - Whether the password meets strength requirements
 */
function validatePassword(password) {
  //At least 8 characters, one uppercase, one lowercase, one number, one special character
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/;
  return passwordRegex.test(password);
}

/**
 * Show an error message to the user
 * @param {string} message - The error message to display
 */
function showError(message) {
  showNotification(message, "error");
}

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success' or 'error')
 */
function showNotification(message, type = "error") {
  //Remove any existing notifications
  const existingNotification = document.querySelector(".notification");
  if (existingNotification) {
    existingNotification.remove();
  }

  //Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${type}`; //adds 2 classes for this element.
  notification.textContent = message;

  //Add to DOM
  document.body.appendChild(notification);

  //Show the notification (using setTimeout to ensure the initial state is set)
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  //Hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove("show");

    //Remove from DOM after animation completes
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 5000);
}

/**
 * Set a button's loading state
 * @param {HTMLElement} button - The button element
 * @param {boolean} isLoading - Whether to show loading state
 * @param {string} originalText - The original button text to restore when not loading
 */
function setLoading(button, isLoading, originalText = null) {
  if (isLoading) {
    button.innerHTML = '<span class="loading-spinner"></span>Loading...';
    button.disabled = true;
  } else {
    button.innerHTML = originalText || "Submit";
    button.disabled = false;
  }
}

/**
 * cookie-policy.js - JavaScript for the Cookie Policy page
 * This file contains enhancements for the Cookie Policy page
 */

document.addEventListener("DOMContentLoaded", () => {
  // Add smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();

      const targetId = this.getAttribute("href");
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80, // Account for fixed header
          behavior: "smooth",
        });
      }
    });
  });

  // Add animation to sections when they come into view
  const observerOptions = {
    threshold: 0.2,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe all section cards for animation
  document.querySelectorAll(".about-section .card").forEach((section) => {
    observer.observe(section);
  });

  // Immediately trigger animation for all cards
  document.querySelectorAll(".about-section .card").forEach((section) => {
    section.classList.add("visible");
  });
});

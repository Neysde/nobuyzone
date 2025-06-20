import passport from "passport";

// CORRECTED AND SIMPLIFIED MIDDLEWARE
export const isAuthenticated = (req, res, next) => {
  // The global middleware in index.mjs has already tried to attach the user.
  // We just need to check if req.user exists now.
  if (req.user) {
    return next(); // If the user is authenticated, proceed to the route.
  }

  // If no user was found, redirect to the login page.
  return res.redirect("/api/login");
};

// Middleware to check if the user is an authenticated admin
export const isAdmin = (req, res, next) => {
  // Check if the admin user is stored in the session
  // This assumes you will set req.session.adminUser upon successful admin login
  if (req.session && req.session.adminUser) {
    // Admin is authenticated, proceed to the next middleware or route handler
    return next();
  }
  // Admin is not authenticated, redirect to the admin login page
  // You might want to add a flash message here for better UX
  res.redirect("/admin/login");
};

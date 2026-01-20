import passport from "passport";

// CORRECTED AND SIMPLIFIED MIDDLEWARE
export const isAuthenticated = (req, res, next) => {
  // The global middleware in index.mjs has already tried to attach the user.
  // We just need to check if req.user exists now.
  if (req.user) {
    return next(); // If the user is authenticated, proceed to the route.
  }

  // If no user was found, redirect to the login page.
  return res.redirect("/login");
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

// Custom MongoDB Sanitization Middleware
// Removes keys starting with '$' to prevent operator injection.
// Modifies objects in-place to avoid reassignment issues (e.g., req.query in Express 5).
function clean(obj) {
  if (obj instanceof Object) {
    for (const key in obj) {
      if (/^\$/.test(key)) {
        delete obj[key];
      } else {
        clean(obj[key]); // recursive for obj inside obj
      }
    }
  }
}

export const mongoSanitize = (req, res, next) => {
  if (req.body) clean(req.body);
  if (req.query) clean(req.query);
  if (req.params) clean(req.params);
  next();
};

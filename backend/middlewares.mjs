import passport from "passport";

export const isAuthenticated = (req, res, next) => {
  //When you use passport.authenticate, it uses the passport strategy to authenticate requests.
  //During this process, information can flow between your strategy and the authenticate middleware.
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err) {
      console.error("Authentication error:", err);
      return res.redirect("/api/login");
    }

    if (!user) {
      return res.redirect("/api/login");
    }

    //Authentication succeeded, set user in req and proceed.
    req.user = user; //to access the related user information in the login required pages. (Isn't it the whole point of implementing login system?)
    next();
  })(req, res, next); //This immediately invokes the authenticate function with with the current request, response, and next
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

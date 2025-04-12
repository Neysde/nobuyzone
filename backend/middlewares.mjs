import passport from "passport";

export const isAuthenticated = (req, res, next) => {
  //When you use passport.authenticate, it uses the passport strategy to authenticate requests.
  //During this process, information can flow between your strategy and the authenticate middleware.
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      return res.redirect("/api/login");
    }

    if (!user) {
      console.log("Authentication failed:", info?.message || "No user found");
      return res.redirect("/api/login");
    }

    //Authentication succeeded, set user in req and proceed.
    req.user = user; //to access the related user information in the login required pages. (Isn't it the whole point of implementing login system?)
    next();
  })(req, res, next); //This immediately invokes the authenticate function with with the current request, response, and next
};

import express from "express";
import Post from "../mongoose/post.mjs";
import User from "../mongoose/user.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import passport from "passport";
import { getChatsForUser } from "../utils/chat-utils.mjs"; // Import the new function
import { allCategories, categoryMap } from "../utils/categories.mjs";

const router = express.Router();

// Find posts page
router.get("/find-posts", (req, res, next) => {
  //Authenticate without redirecting - just check if user is logged in
  passport.authenticate("jwt", { session: false }, async (err, user) => {
    if (err) {
      console.error("Authentication error:", err);
      return next(err);
    }

    try {
      // Base query filter
      const baseFilter = { status: "active", approved: true };

      // If user is logged in, add a filter to exclude their own posts
      if (user) {
        baseFilter.createdBy = { $ne: user._id };
      }

      // Check if city parameter exists from map click
      const { city } = req.query;

      if (city) {
        // If city is provided, filter posts by city - using regex for case-insensitive search
        baseFilter["location.city"] = { $regex: new RegExp(city, "i") };
      }

      const posts = await Post.find(baseFilter).sort({
        createdAt: -1,
      });

      // Count posts by category for sidebar display.
      // This aggregation groups posts by the `category` field, which stores the category value (e.g., "elektronik").
      const categoryCounts = await Post.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]);

      // Create a map of counts where the key is the category value (e.g., "elektronik") and the value is the count.
      const countsMap = new Map(
        categoryCounts.map((item) => [item._id, item.count])
      );

      // Create the final list of categories to be sent to the template.
      // It merges the master list of all categories with the actual counts.
      const categories = allCategories.map((cat) => ({
        value: cat.value,
        display: cat.display,
        count: countsMap.get(cat.value) || 0, // Look up the count using the correct category value.
      }));

      // Total count for "All Categories"
      const totalCount = await Post.countDocuments(baseFilter); // Apply the same filter here

      // Fetch complete user data if user is authenticated
      let userData = null;
      if (user) {
        userData = await User.findById(user._id);
      }

      const categoryMapJson = JSON.stringify(categoryMap || {}).replace(/</g, "\\u003c"); // preventing XSS by preventing </script> tag

      res.render("find-posts", {
        posts,
        categories,
        categoryMap,
        categoryMapJson,
        totalCount,
        user: userData, // Pass the complete user object to the template
        title: "İlanlar | NoBuyZone",
        currentFilters: {
          category: "all",
          search: "",
          city: city || "", // Pass the city to the template
          district: "",
          neighborhood: "",
          sort: "newest",
          page: 1,
        },
      });
    } catch (error) {
      console.error("Error rendering find posts page:", error);
      res.status(500).render("error", {
        message: "Error loading posts",
        error: { status: 500 },
      });
    }
  })(req, res, next); // Immediately invoke the authenticate function
});

//Post detail page
router.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      // Redirect instead of rendering error page
      return res.redirect("/");
    }

    // Check if the logged-in user is the creator of the post
    if (
      req.user &&
      post.createdBy &&
      post.createdBy.toString() === req.user._id.toString()
    ) {
      // If so, redirect them to the find-posts page, as they should not see their own post's detail page from here.
      // Alternatively, you could show an error message or redirect to their dashboard.
      return res.redirect("/find-posts");
    }

    // Fetch post creator's user data
    const createdByUser = await User.findById(post.createdBy);
    // Attach user data to post object for template access
    post.createdByUser = createdByUser;

    //Create a user object if user is logged in
    let user = null;
    if (req.user) {
      // Get a clean reference to the post ID as a string for comparison
      const postIdStr = post._id.toString();

      // Fetch the complete user data
      const userData = await User.findById(req.user._id);
      if (userData) {
        // Convert favorites and flaggedPosts arrays to strings for direct comparison
        const favorites = userData.favorites
          ? userData.favorites.map((id) => id.toString())
          : [];
        const flaggedPosts = userData.flaggedPosts
          ? userData.flaggedPosts.map((id) => id.toString())
          : [];

        // Create user object with ALL properties from userData plus the convenience flags
        user = userData.toObject();

        // Add convenience boolean flags for template rendering
        user.hasFavorited = favorites.includes(postIdStr);
        user.hasFlagged = flaggedPosts.includes(postIdStr);
      }
    }

    res.render("post-detail", {
        post,
        user,
        title: `${post.title} | NoBuyZone`
      });
  } catch (error) {
    console.error("Error rendering post detail:", error);
    //Redirect instead of rendering error page
    return res.redirect("/");
  }
});

// Dashboard page for user
router.get("/dashboard/:id", isAuthenticated, async (req, res) => {
  try {
    // Get the user id from the route parameter
    const userId = req.params.id;

    // Fetch the user data with populated favorites
    const user = await User.findById(userId).populate({
      path: "favorites",
      select: "title category location images createdAt status",
    });

    if (!user) {
      // Redirect instead of rendering error page
      return res.redirect("/");
    }

    // Fetch user's active posts
    const posts = await Post.find({
      createdBy: userId,
      status: "active",
    }).sort({ createdAt: -1 });

    // Fetch user's draft posts
    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).sort({ updatedAt: -1 });

    // Transform favorites to match the expected format in the template
    const favorites = user.favorites
      .filter((post) => post.status === "active") // Filter out inactive posts
      .map((post) => {
        return {
          post: post,
          addedAt: post.createdAt, // We don't have the exact date added as favorite
        };
      });

    // This now calls our reliable utility function directly.
    const chats = await getChatsForUser(req.user._id.toString());


    // Render the dashboard template with all the data
    res.render("dashboard", {
      user,
      posts,
      drafts,
      favorites,
      chats,
      title: "NoBuyZone",
      formatTime: (date) => {
        const messageDate = new Date(date);
        const now = new Date();

        // If it's today, show time
        if (messageDate.toDateString() === now.toDateString()) {
          return messageDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        }

        // If it's within a week, show day name
        const dayDiff = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
        if (dayDiff < 7) {
          return messageDate.toLocaleDateString([], { weekday: "short" });
        }

        // Otherwise show date
        return messageDate.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
      },
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error);
    // Redirect instead of rendering error page
    return res.redirect("/");
  }
});

// User drafts page
router.get("/profile/drafts", async (req, res) => {
  try {
    // In a real application, you would use the authenticated user's ID
    const userId = req.user?._id;

    // Fetch complete user data if user is authenticated
    let userData = null;
    if (userId) {
      userData = await User.findById(userId);
    }

    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).sort({ updatedAt: -1 });

    res.render("drafts", {
      drafts,
      user: userData,
    });
  } catch (error) {
    console.error("Error rendering drafts page:", error);
    // Redirect instead of rendering error page
    return res.redirect("/");
  }
});

// Authentication pages
// Login page
router.get("/login", (req, res) => {
  res.render("login", { breadcrumbs: "Login", layout: false });
});

// Register page
router.get("/register", (req, res) => {
  res.render("register", { breadcrumbs: "Register", layout: false });
});

// Password reset request page
router.get("/passwordreset", (req, res) => {
  res.render("password-reset-request", {
    breadcrumbs: "Reset Password",
    layout: false,
  });
});

// Password reset page (after clicking the link in email)
router.get("/reset/:id/:token", async (req, res) => {
  // This route will be used for both verifying the token and displaying the reset form
  // The actual verification happens in the backend user-routes.mjs
  res.render("password-reset", {
    breadcrumbs: "Set New Password",
    userId: req.params.id,
    token: req.params.token,
    layout: false,
  });
});

// Email verification success page
router.get("/:id/verify/:token/success", (req, res) => {
  res.render("verify-success", {
    breadcrumbs: "Email Verified",
    layout: false,
  });
});

// About Us page
router.get("/about-us", (req, res) => {
  try {
    res.render("about-us", {
      user: req.user,
      title: "Hakkımızda | NoBuyZone",
      page: "about-us",
      layout: "layout",
    });
  } catch (error) {
    console.error("Error rendering about-us page:", error);
    res.status(500).render("error", {
      message: "Error loading about-us page",
      error: { status: 500 },
    });
  }
});





//user agreement page
router.get('/user-agreement', (req, res) => {
  res.render('user-agreement', {
      title: 'Kullanıcı Sözleşmesi | NoBuyZone',
      description: 'NoBuyZone.com Kullanıcı Sözleşmesi',
      isAuthenticated: req.isAuthenticated(),
      currentPage: 'user-agreement'
  });
});





//registration terms page
router.get('/forbidden-products', (req, res) => {
  res.render('forbidden-products', {
      title: 'Yasaklı Ürünler Listesi | NoBuyZone',
      description: 'NoBuyZone.com Üyelik Koşulları',
      isAuthenticated: req.isAuthenticated(),
      currentPage: 'forbidden-products'
  });
});

// Contact Us page
router.get("/contact-us", (req, res) => {
  try {
    res.render("contact-us", {
      user: req.user,
      title: "Bize Ulaşın | NoBuyZone",
      page: "contact-us",
      layout: "layout",
    });
  } catch (error) {
    console.error("Error rendering contact-us page:", error);
    res.status(500).render("error", {
      message: "Error loading contact-us page",
      error: { status: 500 },
    });
  }
});

// Privacy Policy page
router.get("/privacy-policy", (req, res) => {
  try {
    res.render("privacy-policy", {
      user: req.user,
      title: "Gizlilik Politikası | NoBuyZone",
      page: "privacy-policy",
      layout: "layout",
    });
  } catch (error) {
    console.error("Error rendering privacy-policy page:", error);
    res.status(500).render("error", {
      message: "Error loading privacy-policy page",
      error: { status: 500 },
    });
  }
});

// Cookie Policy page
router.get("/cookie-policy", (req, res) => {
  try {
    res.render("cookie-policy", {
      user: req.user,
      title: "Çerez Politikası | NoBuyZone",
      page: "cookie-policy",
      layout: "layout",
    });
  } catch (error) {
    console.error("Error rendering cookie-policy page:", error);
    res.status(500).render("error", {
      message: "Error loading cookie-policy page",
      error: { status: 500 },
    });
  }
});

// KVKK Clarification page
router.get("/kvkk-clarification", (req, res) => {
  try {
    res.render("kvkk-clarification", {
      user: req.user,
      title: "KVKK Aydınlatma Metni | NoBuyZone",
      page: "kvkk-clarification",
      layout: "layout",
    });
  } catch (error) {
    console.error("Error rendering kvkk-clarification page:", error);
    res.status(500).render("error", {
      message: "Error loading kvkk-clarification page",
      error: { status: 500 },
    });
  }
});

export default router;


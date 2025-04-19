import express from "express";
import Post from "../mongoose/post.mjs";
import User from "../mongoose/user.mjs";
import Favorite from "../mongoose/favorite.mjs";
import { isAuthenticated } from "../middlewares.mjs";

const router = express.Router();

// Find posts page
router.get("/find-posts", async (req, res) => {
  try {
    const posts = await Post.find({ status: "active" }).sort({ createdAt: -1 });

    //Count posts by category for sidebar display THIS will be used later for other purposes!!!
    const categoryCounts = await Post.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    //Transform category counts into a format easier to use in the template
    const categories = {};
    categoryCounts.forEach((cat) => {
      categories[cat._id] = cat.count;
    });

    // Total count for "All Categories"
    const totalCount = await Post.countDocuments({ status: "active" });

    res.render("find-posts", {
      posts,
      categories,
      totalCount,
      currentFilters: {
        category: "all",
        search: "",
        city: "",
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
});

// Post detail page
router.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).render("error", {
        message: "Post not found",
        error: { status: 404 },
      });
    }

    res.render("post-detail", { post });
  } catch (error) {
    console.error("Error rendering post detail:", error);
    res.status(500).render("error", {
      message: "Error loading post",
      error: { status: 500 },
    });
  }
});

// Dashboard page for user
router.get("/dashboard/:id", isAuthenticated, async (req, res) => {
  try {
    // Get the user id from the route parameter
    const userId = req.params.id;

    // Fetch the user data
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).render("error", {
        message: "User not found",
        error: { status: 404 },
      });
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

    // Fetch user's favorites with populated post data
    const favoritesData = await Favorite.find({ userId: userId })
      .populate({
        path: "postId",
        model: "Post",
        select: "title category location images createdAt status",
      })
      .sort({ createdAt: -1 });

    // Transform favorites to match the expected format in the template
    const favorites = favoritesData
      .map((favorite) => {
        return {
          post: favorite.postId,
          addedAt: favorite.createdAt,
        };
      })
      .filter((favorite) => favorite.post.status === "active"); // Only include active posts

    // Render the dashboard template with all the data
    res.render("dashboard", {
      user,
      posts,
      drafts,
      favorites,
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error);
    res.status(500).render("error", {
      message: "Error loading dashboard",
      error: { status: 500 },
    });
  }
});

// User drafts page
router.get("/profile/drafts", async (req, res) => {
  try {
    // In a real application, you would use the authenticated user's ID
    const userId = req.user?._id;

    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).sort({ updatedAt: -1 });

    res.render("drafts", { drafts });
  } catch (error) {
    console.error("Error rendering drafts page:", error);
    res.status(500).render("error", {
      message: "Error loading drafts",
      error: { status: 500 },
    });
  }
});

// Authentication pages
// Login page
router.get("/api/login", (req, res) => {
  res.render("login", { breadcrumbs: "Login", layout: false });
});

// Register page
router.get("/api/register", (req, res) => {
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
router.get("/:id/:token", async (req, res) => {
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

export default router;

import express from "express";
import Post from "../mongoose/post.mjs";

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

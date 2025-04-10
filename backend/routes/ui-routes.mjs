import express from "express";
import Post from "../mongoose/post.mjs";

const router = express.Router();

// Find posts page
router.get("/find-posts", async (req, res) => {
  try {
    // In a real implementation, you would fetch initial posts with pagination
    // This would be replaced with filtered queries based on request parameters
    const posts = await Post.find({ status: "active" }).sort({ createdAt: -1 });

    // Count posts by category for sidebar display
    const categoryCounts = await Post.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    // Transform category counts into a format easier to use in the template
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

export default router;

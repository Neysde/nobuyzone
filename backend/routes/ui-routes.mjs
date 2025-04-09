import express from "express";
import Post from "../mongoose/post.mjs";

const router = express.Router();

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

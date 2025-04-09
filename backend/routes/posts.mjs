import express from "express";
import Post from "../mongoose/post.mjs";

const router = express.Router();

// Add middleware to parse different types of form data
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/**
 * Create a new post
 * Handles the form submission from the posting page
 */
router.post("/api/posts", async (req, res) => {
  try {
    console.log("Post data received:", req.body);

    // Check if body is empty
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Request body is empty",
      });
    }

    const {
      title,
      category,
      condition,
      description,
      city,
      district,
      neighborhood,
      street,
      latitude,
      longitude,
      contact,
      isDraft,
      imageUrls,
      imageIds,
    } = req.body;

    // Validate required fields
    if (!title || !category || !condition || !description) {
      return res.status(400).json({
        success: false,
        error: "Please provide all required fields",
      });
    }

    // Process images from URLs and IDs arrays
    const images = [];
    if (imageUrls && imageIds) {
      // Handle both array and string cases
      const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
      const ids = Array.isArray(imageIds) ? imageIds : [imageIds];

      // Create image objects
      for (let i = 0; i < urls.length; i++) {
        if (urls[i] && ids[i]) {
          images.push({
            url: urls[i],
            publicId: ids[i],
          });
        }
      }
    }

    // Create new post
    const post = new Post({
      title,
      category,
      condition,
      description,
      location: {
        city,
        district,
        neighborhood,
        street,
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      },
      images,
      contactPreference: contact || "in-app",
      status: isDraft === "true" ? "draft" : "active",
      createdBy: req.user?._id || "64f0e5d7b9b5e30016e2aaaa", // Temporary placeholder ID, replace with actual authentication
    });

    // Save post to database
    await post.save();

    res.status(201).json({
      success: true,
      id: post._id,
      message:
        isDraft === "true"
          ? "Draft saved successfully"
          : "Post created successfully",
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({
      success: false,
      error: "Server error creating post",
    });
  }
});

/**
 * Save post as draft
 */
router.post("/api/posts/draft", async (req, res) => {
  try {
    // Add draft status to body and pass to main post handler
    req.body.isDraft = "true";
    res.redirect(307, "/api/posts");
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({
      success: false,
      error: "Server error saving draft",
    });
  }
});

/**
 * Get all posts
 */
router.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.find({ status: "active" })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching posts",
    });
  }
});

/**
 * Get single post by ID
 */
router.get("/api/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching post",
    });
  }
});

export default router;

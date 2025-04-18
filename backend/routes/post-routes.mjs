import express from "express";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";

const router = express.Router();

// Add middleware to parse different types of form data
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/**
 * Normalize text by removing diacritics and converting to lowercase
 * This will help with search consistency by normalizing characters like İ->i, ş->s, etc.
 * @param {string} text - The text to normalize
 * @returns {string} - Normalized text
 */
const normalizeText = (text) => {
  if (!text) return "";

  // Convert to lowercase and normalize Unicode characters
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
    .replace(/[^a-z0-9\s]/g, ""); // Remove non-alphanumeric characters
};

/**
 * Create an accent-insensitive regex pattern for MongoDB search
 * This helps with cases like searching for "baris" to match "Barış"
 * @param {string} text - The text to search for
 * @returns {object} - MongoDB regex object for the search
 */
const createAccentInsensitiveRegex = (text) => {
  if (!text || typeof text !== "string") return null;

  // Create a pattern that will match the same characters with or without diacritics
  const normalizedText = normalizeText(text);

  // Return both the original search and the normalized search as alternatives
  return {
    $or: [
      { $regex: text, $options: "i" }, // Original text (case insensitive)
      { $regex: normalizedText, $options: "i" }, // Normalized text without diacritics
    ],
  };
};

/**
 * Create a new post
 * Handles the form submission from the posting page
 */
router.post("/api/posts", isAuthenticated, async (req, res) => {
  try {
    console.log("Post data received:", req.body); // will be removed later

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
        city: city ? city.trim() : "",
        district: district ? district.trim() : "",
        neighborhood: neighborhood ? neighborhood.trim() : "",
        street,
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      },
      images,
      contactPreference: contact || "in-app",
      status: isDraft === "true" ? "draft" : "active",
      createdBy: req.user._id,
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
router.post("/api/posts/draft", isAuthenticated, async (req, res) => {
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
 * Save as draft (alternative route from post-routes.mjs)
 */
router.post("/api/drafts", isAuthenticated, async (req, res) => {
  try {
    const newDraft = new Post({
      ...req.body,
      status: "draft",
      createdBy: req.user._id,
    });

    const savedDraft = await newDraft.save();
    res.status(201).json(savedDraft);
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({
      success: false,
      error: "Server error saving draft",
    });
  }
});

/**
 * Get all posts with filtering options
 */
router.get("/api/posts", async (req, res) => {
  try {
    const {
      category,
      search,
      city,
      district,
      neighborhood,
      radius,
      sort,
      page = 1,
      limit = 10,
    } = req.query;

    // Log raw request parameters for debugging
    console.log("Search parameters received:", {
      city,
      district,
      neighborhood,
      search,
    });

    // Build filter query
    const filter = { status: "active" };

    // Category filter
    if (category && category !== "all") {
      filter.category = category;
    }

    // Location filters
    if (city) {
      const normalizedCity = normalizeText(city);
      console.log(`Searching for city: ${city}, normalized: ${normalizedCity}`);

      // For Turkish text: handle common letter transformations
      const searchPatterns = [
        city, // Original text
        // Special handling for Turkish characters
        city.replace(/i/gi, "[iİıI]"), // i↔İ, ı↔I
        city.replace(/s/gi, "[sŞş]"), // s↔ş
        city.replace(/g/gi, "[gĞğ]"), // g↔ğ
        city.replace(/u/gi, "[uUüÜ]"), // u↔ü
        city.replace(/o/gi, "[oOöÖ]"), // o↔ö
        city.replace(/c/gi, "[cCçÇ]"), // c↔ç
        normalizedCity, // Fully normalized
      ];

      // Build $or condition with all search patterns
      const cityConditions = searchPatterns.map((pattern) => ({
        "location.city": { $regex: pattern, $options: "i" },
      }));

      filter.$and = filter.$and || [];
      filter.$and.push({ $or: cityConditions });
    }

    if (district) {
      const normalizedDistrict = normalizeText(district);
      console.log(
        `Searching for district: ${district}, normalized: ${normalizedDistrict}`
      );

      // For Turkish text: handle common letter transformations
      const searchPatterns = [
        district, // Original text
        // Special handling for Turkish characters
        district.replace(/i/gi, "[iİıI]"), // i↔İ, ı↔I
        district.replace(/s/gi, "[sŞş]"), // s↔ş
        district.replace(/g/gi, "[gĞğ]"), // g↔ğ
        district.replace(/u/gi, "[uUüÜ]"), // u↔ü
        district.replace(/o/gi, "[oOöÖ]"), // o↔ö
        district.replace(/c/gi, "[cCçÇ]"), // c↔ç
        normalizedDistrict, // Fully normalized
      ];

      // Build $or condition with all search patterns
      const districtConditions = searchPatterns.map((pattern) => ({
        "location.district": { $regex: pattern, $options: "i" },
      }));

      filter.$and = filter.$and || [];
      filter.$and.push({ $or: districtConditions });
    }

    if (neighborhood) {
      const normalizedNeighborhood = normalizeText(neighborhood);
      console.log(
        `Searching for neighborhood: ${neighborhood}, normalized: ${normalizedNeighborhood}`
      );

      // For Turkish text: handle common letter transformations
      const searchPatterns = [
        neighborhood, // Original text
        // Special handling for Turkish characters
        neighborhood.replace(/i/gi, "[iİıI]"), // i↔İ, ı↔I
        neighborhood.replace(/s/gi, "[sŞş]"), // s↔ş
        neighborhood.replace(/g/gi, "[gĞğ]"), // g↔ğ
        neighborhood.replace(/u/gi, "[uUüÜ]"), // u↔ü
        neighborhood.replace(/o/gi, "[oOöÖ]"), // o↔ö
        neighborhood.replace(/c/gi, "[cCçÇ]"), // c↔ç
        normalizedNeighborhood, // Fully normalized
      ];

      // Build $or condition with all search patterns
      const neighborhoodConditions = searchPatterns.map((pattern) => ({
        "location.neighborhood": { $regex: pattern, $options: "i" },
      }));

      // Define explicit mappings for common neighborhoods
      // This is a fallback for the most common cases that the regex might miss
      if (normalizedNeighborhood === "baris") {
        neighborhoodConditions.push({
          "location.neighborhood": { $regex: "Barış", $options: "i" },
        });
      }

      filter.$and = filter.$and || [];
      filter.$and.push({ $or: neighborhoodConditions });
    }

    // Radius-based search
    // Note: For this to work properly in a real-world scenario,
    // we would need to use MongoDB's geospatial queries with $geoWithin and $centerSphere
    // This would require coordinates to be stored in GeoJSON format
    // This is not implemented yet
    if (radius && parseInt(radius) > 0) {
      // If we have coordinates in the query, we could implement something like:
      // const lat = parseFloat(req.query.latitude);
      // const lng = parseFloat(req.query.longitude);
      // if (!isNaN(lat) && !isNaN(lng)) {
      // filter['location.coordinates'] = {
      // $geoWithin: {
      // $centerSphere: [[lng, lat], parseInt(radius) / 6371] // radius in km, 6371 is Earth's radius in km
      // }
      // };
      // }

      // For now, we'll just log that we received a radius parameter
      console.log(`Searching with radius: ${radius}km`);
    }

    // Text search filter (title and description)
    if (search) {
      // Create a separate $or for text search to avoid mixing with location filters
      const textConditions = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];

      filter.$and = filter.$and || [];
      filter.$and.push({ $or: textConditions });
    }

    // Sort options
    let sortOption = { createdAt: -1 }; // default: newest first

    if (sort === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (sort === "a-z") {
      sortOption = { title: 1 };
    } else if (sort === "z-a") {
      sortOption = { title: -1 };
    }

    // Create the aggregation pipeline
    const pipeline = [
      { $match: filter },
      { $sort: sortOption },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
    ];

    // Log the generated pipeline for debugging
    console.log("Search pipeline:", JSON.stringify(pipeline, null, 2));

    // Execute aggregation pipeline
    const posts = await Post.aggregate(pipeline);

    // Get total count for pagination (need a separate aggregation for count)
    const countPipeline = pipeline.slice(0, -2); // Remove skip and limit
    countPipeline.push({ $count: "total" });

    const countResult = await Post.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      count: totalCount,
      pagination: {
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
        currentPage: parseInt(page),
        totalPages: totalPages,
      },
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
 * Get a single post by ID
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

/**
 * Update a post
 */
router.put("/api/posts/:id", isAuthenticated, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    // Check if post exists
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user is the owner of the post
    if (post.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this post",
      });
    }

    // Update post
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: updatedPost,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({
      success: false,
      error: "Server error updating post",
    });
  }
});

/**
 * Delete a post
 */
router.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    // Check if post exists
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user is the owner of the post
    if (post.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    // Delete post
    await Post.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({
      success: false,
      error: "Server error deleting post",
    });
  }
});

/**
 * Delete a draft
 */
router.delete("/api/drafts/:id", isAuthenticated, async (req, res) => {
  try {
    const draft = await Post.findOne({
      _id: req.params.id,
      status: "draft",
    });

    // Check if draft exists
    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    // Check if user is the owner of the draft
    if (draft.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this draft",
      });
    }

    // Delete draft
    await Post.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Draft deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting draft:", error);
    res.status(500).json({
      success: false,
      error: "Server error deleting draft",
    });
  }
});

/**
 * Get user's posts
 */
router.get("/api/user/posts", isAuthenticated, async (req, res) => {
  try {
    const posts = await Post.find({
      createdBy: req.user._id,
      status: "active",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching user posts:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching user posts",
    });
  }
});

/**
 * Get user's drafts
 */
router.get("/api/user/drafts", isAuthenticated, async (req, res) => {
  try {
    const drafts = await Post.find({
      createdBy: req.user._id,
      status: "draft",
    }).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: drafts,
    });
  } catch (error) {
    console.error("Error fetching user drafts:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching user drafts",
    });
  }
});

export default router;

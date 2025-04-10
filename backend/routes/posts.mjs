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
    console.log("Post data received:", req.body); //will be removed later

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
      //Handle both array and string cases
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
      createdBy: req.user?._id || "64f0e5d7b9b5e30016e2aaaa", //Temporary placeholder ID, replace with actual authentication
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

    // Build filter query
    const filter = { status: "active" };

    // Category filter
    if (category && category !== "all") {
      filter.category = category;
    }

    // Location filters
    if (city) {
      filter["location.city"] = { $regex: city, $options: "i" };
    }

    if (district) {
      filter["location.district"] = { $regex: district, $options: "i" };
    }

    if (neighborhood) {
      filter["location.neighborhood"] = { $regex: neighborhood, $options: "i" };
    }

    // Radius-based search
    // Note: For this to work properly in a real-world scenario,
    // we would need to use MongoDB's geospatial queries with $geoWithin and $centerSphere
    // This would require coordinates to be stored in GeoJSON format
    if (radius && parseInt(radius) > 0) {
      // If we have coordinates in the query, we could implement something like:
      // const lat = parseFloat(req.query.latitude);
      // const lng = parseFloat(req.query.longitude);
      // if (!isNaN(lat) && !isNaN(lng)) {
      //   filter['location.coordinates'] = {
      //     $geoWithin: {
      //       $centerSphere: [[lng, lat], parseInt(radius) / 6371] // radius in km, 6371 is Earth's radius in km
      //     }
      //   };
      // }

      // For now, we'll just log that we received a radius parameter
      console.log(`Searching with radius: ${radius}km`);
    }

    // Search filter (searches in title and description)
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
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

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with pagination
    const posts = await Post.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await Post.countDocuments(filter);

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

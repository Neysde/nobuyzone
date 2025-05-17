import express from "express";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import http from "http";
import User from "../mongoose/user.mjs";

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
      location, // This is the entire location object
      contactPreferences, // Now using array of preferences
      phoneNumber, // Added phone number field
      isDraft,
      imageUrls,
      imageIds,
    } = req.body;

    // Extract location properties
    const city = location?.city || "";
    const district = location?.district || "";
    const neighborhood = location?.neighborhood || "";
    const street = location?.street || "";

    // Extract coordinates - they can be either at the top level or nested in location.coordinates
    let latitude = req.body.latitude;
    let longitude = req.body.longitude;

    // If not found at top level, try to get from location.coordinates
    if ((!latitude || !longitude) && location?.coordinates) {
      latitude = location.coordinates.latitude;
      longitude = location.coordinates.longitude;
    }

    // Validate required fields
    if (!title || !category || !condition || !description) {
      return res.status(400).json({
        success: false,
        error: "Please provide all required fields",
      });
    }

    // Validate contact preferences - ensure we have at least one preference
    const preferences = Array.isArray(contactPreferences)
      ? contactPreferences
      : contactPreferences
      ? [contactPreferences]
      : ["in-app"]; // Default to in-app if nothing is provided

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

    // Get user's email from the database for contact details
    const user = await User.findById(req.user._id).select("email");

    // Create contact details object
    const contactDetails = {
      email: user.email || "",
      phone: phoneNumber || "",
    };

    // Add random offset to coordinates for privacy (0.003 ≈ 300m)
    const offset = 0.003;

    // Parse coordinates, handling both string and number types
    let parsedLat = 0;
    let parsedLng = 0;

    if (latitude && !isNaN(parseFloat(latitude))) {
      parsedLat = parseFloat(latitude);
    }

    if (longitude && !isNaN(parseFloat(longitude))) {
      parsedLng = parseFloat(longitude);
    }

    console.log("Coordinates before offset:", {
      lat: parsedLat,
      lng: parsedLng,
    });

    // Add random offset only if we have valid coordinates
    if (parsedLat !== 0 || parsedLng !== 0) {
      // Generate random offset between -300m and +300m
      parsedLat += Math.random() * offset * 2 - offset;
      parsedLng += Math.random() * offset * 2 - offset;
      console.log("Coordinates after offset:", {
        lat: parsedLat,
        lng: parsedLng,
      });
    }

    // Create new post
    const post = new Post({
      title,
      category,
      condition,
      description,
      location: {
        // Ensure we have valid strings for all required location fields
        city: city && city.trim ? city.trim() : city || "",
        district: district && district.trim ? district.trim() : district || "",
        neighborhood:
          neighborhood && neighborhood.trim
            ? neighborhood.trim()
            : neighborhood || "",
        street: street && street.trim ? street.trim() : street || "",
        coordinates: {
          latitude: parsedLat,
          longitude: parsedLng,
        },
      },
      images,
      contactPreferences: preferences,
      contactDetails,
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
    // Extract and process location data with random offset if coordinates are present
    const draftData = { ...req.body };

    // Process coordinates if they exist - either in location.coordinates or at top level
    let hasCoordinates = false;

    // Create location object if it doesn't exist
    if (!draftData.location) {
      draftData.location = {};
    }

    // Create coordinates object if it doesn't exist
    if (!draftData.location.coordinates) {
      draftData.location.coordinates = {};
    }

    // Check for coordinates at top level or in location
    let rawLat =
      draftData.latitude ||
      (draftData.location.coordinates &&
        draftData.location.coordinates.latitude);
    let rawLng =
      draftData.longitude ||
      (draftData.location.coordinates &&
        draftData.location.coordinates.longitude);

    if (rawLat || rawLng) {
      hasCoordinates = true;
      // Add random offset to coordinates for privacy (0.003 ≈ 300m)
      const offset = 0.003;

      // Parse and validate coordinates
      let lat = !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : 0;
      let lng = !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : 0;

      console.log("Draft API - Coordinates before offset:", { lat, lng });

      // Add random offset only if we have valid coordinates
      if (lat !== 0 || lng !== 0) {
        // Generate random offset between -300m and +300m
        lat += Math.random() * offset * 2 - offset;
        lng += Math.random() * offset * 2 - offset;
        console.log("Draft API - Coordinates after offset:", { lat, lng });
      }

      // Update coordinates with offset values
      draftData.location.coordinates.latitude = lat;
      draftData.location.coordinates.longitude = lng;

      // Delete any top-level coordinate properties to avoid confusion
      delete draftData.latitude;
      delete draftData.longitude;
    }

    const newDraft = new Post({
      ...draftData,
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

    // If user is logged in (via req.user being populated by Passport), exclude their own posts
    if (req.user && req.user._id) {
      filter.createdBy = { $ne: req.user._id };
    }

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
    let sortOption = { updatedAt: -1 }; // default: newest first

    if (sort === "oldest") {
      sortOption = { updatedAt: 1 };
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

    // Prepare the update data
    const updateData = { ...req.body };

    // Process images - create proper image objects from URLs and IDs arrays
    if (updateData.imageUrls && updateData.imageIds) {
      // Handle both array and string cases
      const urls = Array.isArray(updateData.imageUrls)
        ? updateData.imageUrls
        : [updateData.imageUrls];
      const ids = Array.isArray(updateData.imageIds)
        ? updateData.imageIds
        : [updateData.imageIds];

      // Create new array of image objects
      const images = [];
      for (let i = 0; i < urls.length; i++) {
        if (urls[i] && ids[i]) {
          images.push({
            url: urls[i],
            publicId: ids[i],
          });
        }
      }

      // Replace the imageUrls and imageIds with the proper images array
      updateData.images = images;
      delete updateData.imageUrls;
      delete updateData.imageIds;
    }

    // Handle draft status
    // Check if 'isDraft' was actually provided in the request body
    if (updateData.hasOwnProperty("isDraft")) {
      // Normalize the isDraft value to a lowercase string to handle both boolean and string inputs consistently
      // e.g., boolean true -> "true", boolean false -> "false", "True" -> "true"
      const isDraftValue = String(updateData.isDraft).toLowerCase();

      if (isDraftValue === "true") {
        // Explicitly set status to draft if isDraft is true (boolean or string "true")
        updateData.status = "draft";
      } else if (isDraftValue === "false") {
        // Explicitly set status to active if isDraft is false (boolean or string "false")
        // This handles publishing a draft.
        updateData.status = "active";
      }
      // If isDraft is present but its stringified, lowercased value isn't "true" or "false"
      // (e.g., null, an empty string, "on", etc.), updateData.status is not modified by this specific block.
      // The post's original status would be preserved unless 'status' was also explicitly sent in updateData.
    }
    // If 'isDraft' was not part of the request (i.e., not in updateData), this entire block is skipped.
    // In this case, updateData.status is not affected by this isDraft logic,
    // preserving the post's existing status or allowing 'status' to be updated if sent directly in the request body.

    // Remove the isDraft field from updateData as its primary purpose (determining status) is now complete.
    // This prevents it from being directly applied to the Post model if there's no 'isDraft' schema field
    // or if its presence might cause unintended side effects in Mongoose's update.
    delete updateData.isDraft;

    // First, check for coordinates either at the top level or in the location object
    const hasCoordinatesToUpdate =
      updateData.latitude ||
      updateData.longitude ||
      (updateData.location &&
        updateData.location.coordinates &&
        (updateData.location.coordinates.latitude ||
          updateData.location.coordinates.longitude));

    if (hasCoordinatesToUpdate) {
      // Add random offset to coordinates for privacy (0.003 ≈ 300m)
      const offset = 0.003;

      // Check all possible places where coordinates might be
      let rawLat = updateData.latitude;
      let rawLng = updateData.longitude;

      // If not at top level, try to get from location.coordinates
      if (
        (!rawLat || !rawLng) &&
        updateData.location &&
        updateData.location.coordinates
      ) {
        rawLat = rawLat || updateData.location.coordinates.latitude;
        rawLng = rawLng || updateData.location.coordinates.longitude;
      }

      // Parse latitude, with fallbacks
      let parsedLat =
        rawLat && !isNaN(parseFloat(rawLat))
          ? parseFloat(rawLat)
          : post.location && post.location.coordinates
          ? post.location.coordinates.latitude
          : 0;

      // Parse longitude, with fallbacks
      let parsedLng =
        rawLng && !isNaN(parseFloat(rawLng))
          ? parseFloat(rawLng)
          : post.location && post.location.coordinates
          ? post.location.coordinates.longitude
          : 0;

      console.log("Update - Coordinates before offset:", {
        lat: parsedLat,
        lng: parsedLng,
      });

      // Add random offset only if we have valid coordinates
      if (parsedLat !== 0 || parsedLng !== 0) {
        // Generate random offset between -300m and +300m
        parsedLat += Math.random() * offset * 2 - offset;
        parsedLng += Math.random() * offset * 2 - offset;
        console.log("Update - Coordinates after offset:", {
          lat: parsedLat,
          lng: parsedLng,
        });
      }

      // Create location object if it doesn't exist
      if (!updateData.location) {
        updateData.location = {};
      }

      // Create coordinates object if it doesn't exist
      if (!updateData.location.coordinates) {
        updateData.location.coordinates = {};
      }

      // Update coordinates with offset values
      updateData.location.coordinates.latitude = parsedLat;
      updateData.location.coordinates.longitude = parsedLng;

      // Remove separate lat/lng properties
      delete updateData.latitude;
      delete updateData.longitude;
    }

    // Log the update for debugging
    console.log("Updating post with data:", updateData);

    // Update post
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      updateData,
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

    // Delete images from Cloudinary using the existing /api/delete/:public_id endpoint
    if (post.images && post.images.length > 0) {
      const deletePromises = post.images
        .filter((image) => image.publicId) // Only process images with publicId
        .map(async (image) => {
          try {
            // Construct a full URL for the fetch request
            // Get the protocol (http/https) and host from the request
            const protocol = req.protocol; // 'http' or 'https'
            const host = req.get("host");
            const deleteUrl = `${protocol}://${host}/api/delete/${encodeURIComponent(
              image.publicId
            )}`;

            const response = await fetch(deleteUrl, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                // Include auth cookies from the original request
                Cookie: req.headers.cookie || "",
              },
              // Include credentials to send cookies with the request
              credentials: "same-origin",
            });

            if (response.ok) {
              console.log(`Deleted image ${image.publicId} from Cloudinary`);
            } else {
              const errorData = await response.json();
              console.error(
                `Error deleting image ${image.publicId}:`,
                errorData
              );
            }
          } catch (error) {
            console.error(
              `Error with delete request for image ${image.publicId}:`,
              error
            );
          }
        });

      // Wait for all image deletion operations to complete
      await Promise.all(deletePromises);
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

    // Delete images from Cloudinary using the delete API endpoint
    if (draft.images && draft.images.length > 0) {
      const deletePromises = draft.images
        .filter((image) => image.publicId) // Only process images with publicId
        .map(async (image) => {
          try {
            // Construct a full URL for the fetch request
            // Get the protocol (http/https) and host from the request
            const protocol = req.protocol; // 'http' or 'https'
            const host = req.get("host");
            const deleteUrl = `${protocol}://${host}/api/delete/${encodeURIComponent(
              image.publicId
            )}`;

            const response = await fetch(deleteUrl, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                // Include auth cookies from the original request
                Cookie: req.headers.cookie || "",
              },
              // Include credentials to send cookies with the request
              credentials: "same-origin",
            });

            if (response.ok) {
              console.log(`Deleted image ${image.publicId} from Cloudinary`);
            } else {
              const errorData = await response.json();
              console.error(
                `Error deleting image ${image.publicId}:`,
                errorData
              );
            }
          } catch (error) {
            console.error(
              `Error with delete request for image ${image.publicId}:`,
              error
            );
          }
        });

      // Wait for all image deletion operations to complete
      await Promise.all(deletePromises);
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
    }).sort({ updatedAt: -1 });

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

/**
 * Create or update a draft post
 */
router.post("/api/post-drafts", isAuthenticated, async (req, res) => {
  try {
    // Process the draft data
    const draftData = { ...req.body };

    console.log("Received draft data:", JSON.stringify(draftData, null, 2));
    console.log(
      "Location data received:",
      JSON.stringify(draftData.location, null, 2)
    );

    // Process images - create proper image objects from URLs and IDs arrays
    if (draftData.imageUrls && draftData.imageIds) {
      // Handle both array and string cases
      const urls = Array.isArray(draftData.imageUrls)
        ? draftData.imageUrls
        : [draftData.imageUrls];
      const ids = Array.isArray(draftData.imageIds)
        ? draftData.imageIds
        : [draftData.imageIds];

      // Create new array of image objects
      const images = [];
      for (let i = 0; i < urls.length; i++) {
        if (urls[i] && ids[i]) {
          images.push({
            url: urls[i],
            publicId: ids[i],
          });
        }
      }

      // Replace the imageUrls and imageIds with the proper images array
      draftData.images = images;
      delete draftData.imageUrls;
      delete draftData.imageIds;
    }

    // Set draft status
    draftData.status = "draft";
    draftData.createdBy = req.user._id;

    // Ensure location data is properly structured to prevent validation errors
    if (!draftData.location) {
      draftData.location = {
        city: "",
        district: "",
        neighborhood: "",
        street: "",
        coordinates: {
          latitude: 0,
          longitude: 0,
        },
      };
    } else {
      // Ensure all required location fields exist
      draftData.location.city = draftData.location.city || "";
      draftData.location.district = draftData.location.district || "";
      draftData.location.neighborhood = draftData.location.neighborhood || "";
      draftData.location.street = draftData.location.street || "";

      // Ensure coordinates exist
      if (!draftData.location.coordinates) {
        draftData.location.coordinates = { latitude: 0, longitude: 0 };
      } else {
        // Add random offset to coordinates for privacy (0.003 ≈ 300m)
        const offset = 0.003;

        // Get coordinate values from all possible locations
        let rawLat =
          draftData.location.coordinates.latitude || draftData.latitude;
        let rawLng =
          draftData.location.coordinates.longitude || draftData.longitude;

        // Parse and validate coordinates
        let lat = !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : 0;
        let lng = !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : 0;

        console.log("Draft - Coordinates before offset:", { lat, lng });

        // Add random offset only if we have valid coordinates
        if (lat !== 0 || lng !== 0) {
          // Generate random offset between -300m and +300m
          lat += Math.random() * offset * 2 - offset;
          lng += Math.random() * offset * 2 - offset;
          console.log("Draft - Coordinates after offset:", { lat, lng });
        }

        // Update coordinates with offset values
        draftData.location.coordinates.latitude = lat;
        draftData.location.coordinates.longitude = lng;

        // Delete any top-level coordinate properties to avoid confusion
        delete draftData.latitude;
        delete draftData.longitude;
      }
    }

    // Make sure required fields have at least empty values for drafts
    draftData.title = draftData.title || "Untitled Draft";
    draftData.category = draftData.category || "other";
    draftData.condition = draftData.condition || "good";
    draftData.description = draftData.description || "";

    // Set contact preference from the form's radio button selection
    // The form field name is "contact" in the HTML
    draftData.contactPreferences = draftData.contactPreferences || ["in-app"];
    delete draftData.contact; // Remove the original field after copying its value

    // Log the draft data for debugging
    console.log("Draft data:", draftData);

    let result;
    try {
      if (draftData._id) {
        // Update existing draft
        const existingDraft = await Post.findById(draftData._id);

        // Check if draft exists and user is authorized
        if (!existingDraft) {
          return res.status(404).json({
            success: false,
            message: "Draft not found",
          });
        }

        if (existingDraft.createdBy.toString() !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "Not authorized to update this draft",
          });
        }

        // Update the draft
        result = await Post.findByIdAndUpdate(draftData._id, draftData, {
          new: true,
          runValidators: false, // Skip validation for drafts
        });
      } else {
        // Create new draft - use a direct approach to avoid mongoose validation
        const newDraft = new Post(draftData);
        result = await newDraft.save({ validateBeforeSave: false }); // Skip validation
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (mongoError) {
      console.error("MongoDB error saving draft:", mongoError);

      // Extract detailed validation errors if available
      let errorDetails = {};
      if (mongoError.name === "ValidationError") {
        Object.keys(mongoError.errors).forEach((key) => {
          errorDetails[key] = mongoError.errors[key].message;
        });
        console.error("Validation errors:", errorDetails);
      }

      return res.status(400).json({
        success: false,
        error: "Validation error: " + mongoError.message,
        validationErrors: errorDetails,
        details: mongoError,
      });
    }
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({
      success: false,
      error: "Server error saving draft: " + error.message,
    });
  }
});

/**
 * Toggle flag for a post
 */
router.post("/api/posts/:id/flag", isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user has already flagged this post
    const user = await User.findById(userId);
    if (user.flaggedPosts && user.flaggedPosts.includes(postId)) {
      // If already flagged, remove the flag (unflag)
      await User.findByIdAndUpdate(
        userId,
        { $pull: { flaggedPosts: postId } },
        { new: true }
      );

      // Decrement the post's flag count
      await Post.findByIdAndUpdate(
        postId,
        { $inc: { flagCount: -1 } },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Post unflagged successfully",
        isFlagged: false,
      });
    }

    // Add post to user's flagged posts
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { flaggedPosts: postId } },
      { new: true }
    );

    // Increment the post's flag count
    await Post.findByIdAndUpdate(
      postId,
      { $inc: { flagCount: 1 } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Post flagged successfully",
      isFlagged: true,
    });
  } catch (error) {
    console.error("Error toggling flag:", error);
    res.status(500).json({
      success: false,
      error: "Server error toggling flag",
    });
  }
});

/**
 * Toggle favorite for a post
 */
router.post("/api/posts/:id/favorite", isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user has already favorited this post
    const user = await User.findById(userId);
    if (user.favorites && user.favorites.includes(postId)) {
      // If already favorited, remove from favorites (unfavorite)
      await User.findByIdAndUpdate(
        userId,
        { $pull: { favorites: postId } },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Post removed from favorites",
        isFavorited: false,
      });
    }

    // Add post to user's favorites
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { favorites: postId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Post added to favorites",
      isFavorited: true,
    });
  } catch (error) {
    console.error("Error toggling favorite:", error);
    res.status(500).json({
      success: false,
      error: "Server error toggling favorite",
    });
  }
});

/**
 * Get contact details for a post
 * This endpoint is used to retrieve contact information securely
 */
router.get("/api/posts/:id/contact", isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { method } = req.query;

    // Validate request
    if (!method || !["email", "phone", "in-app"].includes(method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact method requested",
      });
    }

    // Find the post
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if the requested contact method is available for this post
    if (!post.contactPreferences.includes(method)) {
      return res.status(400).json({
        success: false,
        message: `This post does not support ${method} contact`,
      });
    }

    // Get contact details based on method
    let contactInfo = {};

    if (method === "in-app") {
      // For in-app chat, return seller information
      const seller = await User.findById(post.createdBy).select(
        "_id firstName lastName username profilePicture showUsername"
      );
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: "Seller information not found",
        });
      }

      contactInfo = {
        sellerId: seller._id,
        firstName: seller.firstName,
        lastName: seller.lastName,
        username: seller.username,
        sellerAvatar: seller.profilePicture
          ? seller.profilePicture.url
          : "/img/default-avatar.svg",
        postTitle: post.title,
        showUsername: seller.showUsername,
      };
    } else if (method === "email") {
      // Find the post creator to get their email
      if (post.contactDetails && post.contactDetails.email) {
        contactInfo.email = post.contactDetails.email;
      } else {
        // Fallback to finding the user if email isn't in contactDetails
        const postCreator = await User.findById(post.createdBy).select("email");
        if (postCreator) {
          contactInfo.email = postCreator.email;
        } else {
          return res.status(404).json({
            success: false,
            message: "User email information not found",
          });
        }
      }
    } else if (method === "phone") {
      // Get phone from post's contact details
      if (post.contactDetails && post.contactDetails.phone) {
        contactInfo.phone = post.contactDetails.phone;
      } else {
        return res.status(404).json({
          success: false,
          message: "Phone information not available",
        });
      }
    }

    // Return the contact information
    res.status(200).json({
      success: true,
      ...contactInfo,
    });
  } catch (error) {
    console.error("Error retrieving contact details:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving contact details",
    });
  }
});

export default router;

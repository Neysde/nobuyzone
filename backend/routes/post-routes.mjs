import express from "express";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import http from "http";
import User from "../mongoose/user.mjs";
import Message from "../mongoose/message.mjs";

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
      contactPreferences, // Plural, as sent from frontend
      phoneNumber,
      email, // Post-specific email from form
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

    // Validate and process contact preferences
    // 'contactPreferences' (plural) is now destructured from req.body
    let finalContactPreferences;
    if (contactPreferences && Array.isArray(contactPreferences) && contactPreferences.length > 0) {
      finalContactPreferences = contactPreferences;
    } else {
      finalContactPreferences = ["in-app"]; // Default if empty, not an array, or not provided
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

    // Create contact details object
    const contactDetails = {};
    if (phoneNumber) {
      contactDetails.phone = phoneNumber.trim();
    }
    if (email) { // Prioritize email from form for the post itself
      contactDetails.email = email.trim();
    } 
    // If no post-specific email is provided, and 'email' is a preference, 
    // we might consider fetching user.email as a fallback, but the current admin panel logic already does this if contactDetails.email is empty.

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



    // Add random offset only if we have valid coordinates
    if (parsedLat !== 0 || parsedLng !== 0) {
      // Generate random offset between -300m and +300m
      parsedLat += Math.random() * offset * 2 - offset;
      parsedLng += Math.random() * offset * 2 - offset;

    }

    // Determine status based on isDraft flag from req.body
    const postStatus = req.body.isDraft === 'true' || req.body.isDraft === true ? "draft" : "active";

    // If email preference is selected and no email is provided in body (or it's null from frontend), use user's registered email
    // contactDetails should have been initialized earlier in the function.
    if (finalContactPreferences.includes("email") && (req.body.email === null || typeof req.body.email === 'undefined' || String(req.body.email).trim() === "")) {
      if (req.user && req.user.email) {
        contactDetails.email = req.user.email; // Add/overwrite email in contactDetails
      } else {
        console.warn("User (req.user) or user's email (req.user.email) not found for email contact preference.");
      }
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
      contactPreferences: finalContactPreferences,
      contactDetails,
      status: postStatus, // Use determined status (draft or active)
      approved: false, // New posts are not approved by default
      createdBy: req.user._id,
    });

    // Save post to database
    await post.save();

    res.status(201).json({
      success: true,
      id: post._id,
      message:
        isDraft === "true"
          ? "Taslak başarıyla kaydedildi"
          : "İlanınız kontrol edilmeyi bekliyor, yayınlanmak için gerekli şartları karşılıyorsa bir süre sonra yayına alınacaktır. Şuan için bir şey yapmanıza gerek yok.",
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



      // Add random offset only if we have valid coordinates
      if (lat !== 0 || lng !== 0) {
        // Generate random offset between -300m and +300m
        lat += Math.random() * offset * 2 - offset;
        lng += Math.random() * offset * 2 - offset;

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
    // Log raw request parameters for debugging


    const {
      category,
      search,
      city,
      district,
      neighborhood,
      radius,
      sort,
      page = 1,
      limit = 9, // Changed from 10 to 9 posts per page
    } = req.query;

    // Log raw request parameters for debugging

    // Build filter query
    const filter = {
      status: "active", // Only fetch active posts
      approved: true, // Only show approved posts publicly
    };

    // If user is logged in (via req.user being populated by Passport), exclude their own posts
    if (req.user && req.user._id) {
      filter.createdBy = { $ne: req.user._id };
    }

    // Category filter (case-insensitive)
    if (category && category !== "all") {
      filter.category = { $regex: `^${category}$`, $options: "i" };
    }

    // Location filters
    if (city) {
      const normalizedCity = normalizeText(city);

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
      // };
      // };

      // For now, we'll just log that we received a radius parameter
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
 * Get post counts by city
 * This endpoint returns the count of active posts for each city
 */
router.get("/api/posts/count-by-city", async (req, res) => {
  try {
    // Query only active posts and count by city
    const cityCountsAggregation = await Post.aggregate([
      { $match: { status: "active", approved: true } }, // Consider only active and approved posts
      // Add a match stage to ensure location.city is a valid, non-empty string
      {
        $match: {
          "location.city": { $exists: true, $type: "string", $ne: "" },
        },
      },
      // Group by the original city name first to get counts per unique original name
      {
        $group: {
          _id: "$location.city", // Group by original city name
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0, // Exclude the default _id from $group
          cityName: "$_id", // Original city name from DB
          count: 1,
        },
      },
    ]);

    // Log the raw aggregation result for debugging

    // Transform to object where keys are JavaScript-normalized city names (tr-TR lowercase, trimmed) and values are counts
    const cityCountsMap = {};
    cityCountsAggregation.forEach((item, index) => {
      // Ensure cityName is a non-empty string before normalization

      if (
        item.cityName &&
        typeof item.cityName === "string" &&
        item.cityName.trim() !== ""
      ) {
        const normalizedKey = item.cityName.toLowerCase("tr-TR").trim();
        // If multiple original city names normalize to the same key (e.g., "istanbul" and "İstanbul"), sum their counts.
        cityCountsMap[normalizedKey] =
          (cityCountsMap[normalizedKey] || 0) + item.count;
      }
    });

    // Log the final transformed map for debugging

    res.status(200).json({
      success: true,
      data: cityCountsMap,
    });
  } catch (error) {
    console.error("[ERROR] Error in /api/posts/count-by-city:", error);
    res.status(500).json({
      success: false,
      error:
        "Server error fetching post counts by city. Check server logs for details.", // More specific error
      details: error.message, // Include error message if available
    });
  }
});

/**
 * Get a single post by ID (public view)
 */
router.get("/api/posts/:id", async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      status: "active",
      approved: true, // <-- Ensure post is approved for public view
    })
      .populate("createdBy", "username firstName lastName profilePicture")
      .lean();

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
    const postId = req.params.id;
    const post = await Post.findById(postId);

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

    // Process images if URLs and IDs are provided
    if (updateData.imageUrls && updateData.imageIds) {
      const urls = Array.isArray(updateData.imageUrls) ? updateData.imageUrls : [updateData.imageUrls];
      const ids = Array.isArray(updateData.imageIds) ? updateData.imageIds : [updateData.imageIds];
      const images = [];
      for (let i = 0; i < urls.length; i++) {
        if (urls[i] && ids[i]) {
          images.push({ url: urls[i], publicId: ids[i] });
        }
      }

      // Replace the imageUrls and imageIds with the proper images array
      updateData.images = images;
      delete updateData.imageUrls;
      delete updateData.imageIds;
    }

    // Handle contactPreferences (plural array directly from req.body which is updateData)
    if (updateData.hasOwnProperty('contactPreferences')) { // Check if the key was sent
      if (Array.isArray(updateData.contactPreferences) && updateData.contactPreferences.length > 0) {
        // Valid non-empty array, it will be used as is by assigning to post.contactPreferences later.
        // No specific action needed on updateData.contactPreferences here if it's already correct.
      } else {
        // Sent as empty array, null, or not an array: apply default for the update.
        updateData.contactPreferences = ["in-app"];
      }
    }
    // If 'contactPreferences' was not part of updateData, it means client doesn't want to change it,
    // so post.contactPreferences will remain untouched by the $set operation later.

    if (updateData.phoneNumber || updateData.email) {
      updateData.contactDetails = updateData.contactDetails || {}; // Initialize if not exists
      if (updateData.phoneNumber) {
        updateData.contactDetails.phone = updateData.phoneNumber.trim();
        delete updateData.phoneNumber;
      }
      if (updateData.email) {
        updateData.contactDetails.email = updateData.email.trim();
        delete updateData.email;
      }
    }

    // Handle draft status and approval
    // If isDraft is explicitly set to 'false' (publishing a draft) or status is set to 'active'
    // the post should require re-approval.
    if (updateData.hasOwnProperty('isDraft')) {
      if (String(updateData.isDraft).toLowerCase() === 'false' && post.status === 'draft') {
        updateData.status = 'active'; // Explicitly set to active
        updateData.approved = false;  // Requires re-approval
      }
      // If isDraft is true, it's being saved as a draft, approval status doesn't change or is irrelevant
      delete updateData.isDraft; // Remove isDraft as it's handled
    } else if (updateData.status === 'active' && post.status !== 'active') {
      // If status is directly set to 'active' (and it wasn't active before), it also needs re-approval
      updateData.approved = false;
    }

    // Location randomization (copied from original create logic, apply if new coordinates are given)
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

      if ((!rawLat || !rawLng) && updateData.location && updateData.location.coordinates) {
        rawLat = rawLat || updateData.location.coordinates.latitude;
        rawLng = rawLng || updateData.location.coordinates.longitude;
      }

      let parsedLat = rawLat && !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : (post.location && post.location.coordinates ? post.location.coordinates.latitude : 0);
      let parsedLng = rawLng && !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : (post.location && post.location.coordinates ? post.location.coordinates.longitude : 0);



      // Add random offset only if we have valid coordinates
      if (parsedLat !== 0 || parsedLng !== 0) {
        // Generate random offset between -300m and +300m
        parsedLat += Math.random() * offset * 2 - offset;
        parsedLng += Math.random() * offset * 2 - offset;
      }

      if (!updateData.location) updateData.location = {}; // Ensure location object exists
      if (!updateData.location.coordinates) updateData.location.coordinates = {}; // Ensure coordinates object exists
      updateData.location.coordinates.latitude = parsedLat;
      updateData.location.coordinates.longitude = parsedLng;

      // Remove separate lat/lng properties
      delete updateData.latitude;
      delete updateData.longitude;
    }

    const updatedPost = await Post.findByIdAndUpdate(postId, updateData, { new: true });

    let message = "Post updated successfully.";
    if (updatedPost.status === 'active' && updatedPost.approved === false) {
      message = "İlanınız güncellendi ve onay bekliyor.";
    }

    res.status(200).json({
      success: true,
      data: updatedPost,
      message: message,
    });

  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({
      success: false,
      error: "Server error updating post.",
    });
  }
});

/**
 * Delete a post
 */
router.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

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
    const deletedPost = await Post.findByIdAndDelete(req.params.id);

    if (deletedPost) {
      // Delete associated messages
      await Message.deleteMany({ postId: req.params.id });
    }

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
 * Get user's posts (current logged-in user)
 */
router.get("/api/user/posts", isAuthenticated, async (req, res) => {
  try {
    // User should see all their posts (active or draft), regardless of approval status
    const posts = await Post.find({
      createdBy: req.user._id,
    })
      .sort({ updatedAt: -1 })
      .lean();

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
 * Get all active and approved posts for a specific user (public view)
 */
router.get("/api/posts/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const posts = await Post.find({
      createdBy: userId,
      status: "active",
      approved: true,
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "username firstName lastName profilePicture")
      .lean();

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching posts for user:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching user's posts.",
    });
  }
});

/**
 * Get latest active and approved posts (public view)
 */
router.get("/api/posts/latest", async (req, res) => {
  try {
    const latestPosts = await Post.find({
      status: "active",
      approved: true,
    })
      .sort({ createdAt: -1 })
      .limit(10) // Get latest 10 posts
      .populate("createdBy", "username firstName lastName profilePicture")
      .lean();

    res.status(200).json({
      success: true,
      data: latestPosts,
    });
  } catch (error) {
    console.error("Error fetching latest posts:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching latest posts.",
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



        // Add random offset only if we have valid coordinates
        if (lat !== 0 || lng !== 0) {
          // Generate random offset between -300m and +300m
          lat += Math.random() * offset * 2 - offset;
          lng += Math.random() * offset * 2 - offset;

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

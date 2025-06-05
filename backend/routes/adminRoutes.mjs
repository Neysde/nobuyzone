import express from "express";
import Admin from "../mongoose/admin.mjs"; // Admin model
import User from "../mongoose/user.mjs"; // User model
import Post from "../mongoose/post.mjs"; // Post model
import Message from "../mongoose/message.mjs"; // Message model
import { comparePassword } from "../encryptpass.mjs"; // Password comparison utility
import { isAdmin } from "../middlewares.mjs"; // isAdmin middleware
import fetch from 'node-fetch'; // For making internal API calls

const router = express.Router();

// GET /admin/login - Display admin login page
router.get("/login", (req, res) => {
  // If admin is already logged in, redirect to the panel
  if (req.session.adminUser) {
    return res.redirect("/admin/panel");
  }
  res.render("adminLogin", { layout: false, error: null }); // Assuming admin pages don't use the main layout by default
});

// POST /admin/login - Handle admin login attempt
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render("adminLogin", {
      layout: false,
      error: "Username and password are required.",
    });
  }

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.render("adminLogin", {
        layout: false,
        error: "Invalid username or password.",
      });
    }

    const isMatch = await comparePassword(password, admin.password);
    if (!isMatch) {
      return res.render("adminLogin", {
        layout: false,
        error: "Invalid username or password.",
      });
    }

    // Store admin information in session
    req.session.adminUser = {
      id: admin._id,
      username: admin.username,
    };

    res.redirect("/admin/panel");
  } catch (error) {
    console.error("Admin login error:", error);
    res.render("adminLogin", {
      layout: false,
      error: "An error occurred. Please try again.",
    });
  }
});

// GET /admin/logout - Handle admin logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Admin logout error:", err);
      // Optionally, handle error more gracefully, e.g., send an error page or message
      return res.status(500).send("Could not log out, please try again.");
    }
    res.redirect("/admin/login");
  });
});

// GET /admin/panel - Display admin panel (protected)
// This will be the main dashboard for admins
router.get("/panel", isAdmin, async (req, res) => {
  try {
    // Fetch all users
    let users = await User.find({}).lean(); // .lean() for plain JS objects

    // --- Post Sorting Logic --- //
    const sortOption = req.query.sortPostsBy || "date_desc"; // Default sort: newest first
    let mongooseSortOptions = {};

    switch (sortOption) {
      case "title_asc":
        mongooseSortOptions = { title: 1 };
        break;
      case "title_desc":
        mongooseSortOptions = { title: -1 };
        break;
      case "flagCount_desc":
        mongooseSortOptions = { flagCount: -1, updatedAt: -1 }; // Secondary sort by date
        break;
      case "flagCount_asc":
        mongooseSortOptions = { flagCount: 1, updatedAt: -1 }; // Secondary sort by date
        break;
      case "date_asc": // Oldest first
        mongooseSortOptions = { updatedAt: 1 };
        break;
      case "date_desc": // Newest first
      default:
        mongooseSortOptions = { updatedAt: -1 };
        break;
    }
    // --- End Post Sorting Logic --- //

    // Fetch all posts - these are needed for both post table and user flag count calculation
    const posts = await Post.find({})
      .populate({
        path: "createdBy",
        select: "firstName lastName username",
      })
      .sort(mongooseSortOptions)
      .lean();

    // --- Calculate Total Flag Count for Each User --- //
    const userFlagCounts = {}; // Object to store total flags per user ID

    posts.forEach((post) => {
      if (post.createdBy && post.createdBy._id) {
        // Ensure createdBy and its _id exist
        const userId = post.createdBy._id.toString();
        userFlagCounts[userId] =
          (userFlagCounts[userId] || 0) + (post.flagCount || 0);
      }
    });

    // Add totalFlagCount to each user object
    users = users.map((user) => ({
      ...user,
      totalFlagCount: userFlagCounts[user._id.toString()] || 0, // Get count or default to 0
    }));
    // --- End User Flag Count Calculation --- //

    res.render("adminPanel", {
      layout: false,
      adminUser: req.session.adminUser,
      users: users, // users array now includes totalFlagCount
      posts: posts,
      pageTitle: "Admin Panel",
      currentSortPostsBy: sortOption,
    });
  } catch (error) {
    console.error("Error fetching data for admin panel:", error);
    // Render an error page or redirect with an error message
    res.status(500).send("Error loading admin panel data.");
  }
});

// GET /admin/posts/waiting - Fetch all posts awaiting approval
router.get("/posts/waiting", isAdmin, async (req, res) => {
  try {
    const waitingPosts = await Post.find({ approved: false })
      .populate("createdBy", "username firstName lastName email") // Populate relevant user details
      .sort({ createdAt: -1 }) // Show newest first
      .lean();

    res.status(200).json({
      success: true,
      data: waitingPosts,
    });
  } catch (error) {
    console.error("Error fetching waiting posts:", error);
    res.status(500).json({
      success: false,
      error: "Server error fetching posts awaiting approval.",
    });
  }
});

// PATCH /admin/posts/:postId/approve - Approve a post
router.patch("/posts/:postId/approve", isAdmin, async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    if (post.approved) {
      return res.status(400).json({
        success: false,
        message: "Post is already approved.",
      });
    }

    post.approved = true;
    post.approvedAt = new Date(); // Optionally track approval time
    await post.save();

    res.status(200).json({
      success: true,
      message: "Post approved successfully.",
      data: post,
    });
  } catch (error) {
    console.error("Error approving post:", error);
    res.status(500).json({
      success: false,
      error: "Server error approving post.",
    });
  }
});

// DELETE /admin/users/:userId - Delete a user
router.delete("/users/:userId", isAdmin, async (req, res) => {
  try {
    const userIdToDelete = req.params.userId;
    const user = await User.findById(userIdToDelete);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const userPosts = await Post.find({ createdBy: user._id });
    let imageDeletionErrors = [];

    for (const post of userPosts) {
      if (post.images && post.images.length > 0) {
        for (const image of post.images) {
          if (image.publicId) {
            try {
              const deleteUrl = `${req.protocol}://${req.get('host')}/api/delete/${image.publicId}`;
              const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                  // Forward admin session cookie
                  'Cookie': req.headers.cookie || '' 
                }
              });
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                const errMsg = `Admin: Failed to delete image ${image.publicId} for post ${post._id} via API call to ${deleteUrl}. Status: ${response.status}, Message: ${errorData.message}`;
                console.error(errMsg);
                imageDeletionErrors.push(errMsg);
              }
            } catch (fetchError) {
              const errMsg = `Admin: Error calling delete API for image ${image.publicId} (post ${post._id}) to ${deleteUrl}: ${fetchError.message}`;
              console.error(errMsg, fetchError);
              imageDeletionErrors.push(errMsg);
            }
          }
        }
      }
      await Message.deleteMany({ postId: post._id });
      await Post.findByIdAndDelete(post._id);
    }

    await Message.deleteMany({ "users.user": user._id });
    await User.findByIdAndDelete(userIdToDelete);

    if (imageDeletionErrors.length > 0) {
      return res.status(207).json({
        success: true,
        message: "User and their posts/messages deleted, but some Cloudinary images may not have been fully cleaned up via API calls. Check server logs.",
        errors: imageDeletionErrors
      });
    }

    res.json({ success: true, message: "User and all associated data deleted successfully by admin." });

  } catch (error) {
    console.error("Error in admin deleting user:", error);
    res.status(500).json({ success: false, message: "Server error while admin deleting user." });
  }
});


// DELETE /admin/posts/:postId - Delete a post
router.delete("/posts/:postId", isAdmin, async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found." });
    }

    let imageDeletionErrors = [];
    if (post.images && post.images.length > 0) {
      for (const image of post.images) {
        if (image.publicId) {
          try {
            const deleteUrl = `${req.protocol}://${req.get('host')}/api/delete/${image.publicId}`;
            const response = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'Cookie': req.headers.cookie || ''
              }
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: response.statusText }));
              const errMsg = `Admin: Failed to delete image ${image.publicId} for post ${postId} via API call to ${deleteUrl}. Status: ${response.status}, Message: ${errorData.message}`;
              console.error(errMsg);
              imageDeletionErrors.push(errMsg);
            }
          } catch (fetchError) {
            const errMsg = `Admin: Error calling delete API for image ${image.publicId} (post ${postId}) to ${deleteUrl}: ${fetchError.message}`;
            console.error(errMsg, fetchError);
            imageDeletionErrors.push(errMsg);
          }
        }
      }
    }

    await Message.deleteMany({ postId: postId });
    await Post.findByIdAndDelete(postId);

    if (imageDeletionErrors.length > 0) {
      return res.status(207).json({
        success: true,
        message: "Post and messages deleted, but some Cloudinary images may not have been fully cleaned up via API calls. Check server logs.",
        errors: imageDeletionErrors
      });
    }

    res.json({ success: true, message: "Post and all associated data deleted successfully by admin." });

  } catch (error) {
    console.error("Error in admin deleting post:", error);
    res.status(500).json({ success: false, message: "Server error while admin deleting post." });
  }
});

export default router;

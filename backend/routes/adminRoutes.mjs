import express from "express";
import Admin from "../mongoose/admin.mjs"; // Admin model
import User from "../mongoose/user.mjs"; // User model
import Post from "../mongoose/post.mjs"; // Post model
import { comparePassword } from "../encryptpass.mjs"; // Password comparison utility
import { isAdmin } from "../middlewares.mjs"; // isAdmin middleware

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
        mongooseSortOptions = { flagCount: -1, createdAt: -1 }; // Secondary sort by date
        break;
      case "flagCount_asc":
        mongooseSortOptions = { flagCount: 1, createdAt: -1 }; // Secondary sort by date
        break;
      case "date_asc": // Oldest first
        mongooseSortOptions = { createdAt: 1 };
        break;
      case "date_desc": // Newest first
      default:
        mongooseSortOptions = { createdAt: -1 };
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
    // Or, render the panel with empty data and an error message
    // res.render('adminPanel', {
    //   layout: false,
    //   adminUser: req.session.adminUser,
    //   users: [],
    //   posts: [],
    //   pageTitle: 'Admin Panel',
    //   error: 'Could not load data.'
    // });
  }
});

// DELETE /admin/users/:userId - Delete a user
router.delete("/users/:userId", isAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Optional: Add logic here to handle user's posts (e.g., delete them, reassign them, or mark as anonymous)
    // For now, we are just deleting the user.

    res.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting user." });
  }
});

// DELETE /admin/posts/:postId - Delete a post
router.delete("/posts/:postId", isAdmin, async (req, res) => {
  try {
    const postId = req.params.postId;
    const deletedPost = await Post.findByIdAndDelete(postId);

    if (!deletedPost) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    // IMPORTANT: In a production environment, you would also need to:
    // 1. Delete associated images from Cloudinary using deletedPost.images[].publicId
    // 2. Remove this postId from any User.favorites or User.flaggedPosts arrays
    // For this exercise, we are only deleting the post document from the database.

    res.json({ success: true, message: "Post deleted successfully." });
  } catch (error) {
    console.error("Error deleting post:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting post." });
  }
});

export default router;

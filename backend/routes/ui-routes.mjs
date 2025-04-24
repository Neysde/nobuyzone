import express from "express";
import Post from "../mongoose/post.mjs";
import User from "../mongoose/user.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import passport from "passport";
import Message from "../mongoose/message.mjs";

const router = express.Router();

// Find posts page
router.get("/find-posts", (req, res, next) => {
  //Authenticate without redirecting - just check if user is logged in
  passport.authenticate("jwt", { session: false }, async (err, user) => {
    if (err) {
      console.error("Authentication error:", err);
      return next(err);
    }

    try {
      const posts = await Post.find({ status: "active" }).sort({
        createdAt: -1,
      });

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

      // Fetch complete user data if user is authenticated
      let userData = null;
      if (user) {
        userData = await User.findById(user._id);
      }

      res.render("find-posts", {
        posts,
        categories,
        totalCount,
        user: userData, // Pass the complete user object to the template
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
  })(req, res, next); // Immediately invoke the authenticate function
});

//Post detail page
router.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).render("error", {
        message: "Post not found",
        error: { status: 404 },
      });
    }

    //Create a user object if user is logged in
    let user = null;
    if (req.user) {
      // Get a clean reference to the post ID as a string for comparison
      const postIdStr = post._id.toString();

      // Fetch the complete user data
      const userData = await User.findById(req.user._id);
      if (userData) {
        // Convert favorites and flaggedPosts arrays to strings for direct comparison
        const favorites = userData.favorites
          ? userData.favorites.map((id) => id.toString())
          : [];
        const flaggedPosts = userData.flaggedPosts
          ? userData.flaggedPosts.map((id) => id.toString())
          : [];

        // Create user object with ALL properties from userData plus the convenience flags
        user = userData.toObject();

        // Add convenience boolean flags for template rendering
        user.hasFavorited = favorites.includes(postIdStr);
        user.hasFlagged = flaggedPosts.includes(postIdStr);
      }
    }

    res.render("post-detail", {
      post,
      user,
    });
  } catch (error) {
    console.error("Error rendering post detail:", error);
    res.status(500).render("error", {
      message: "Error loading post",
      error: { status: 500 },
    });
  }
});

// Dashboard page for user
router.get("/dashboard/:id", isAuthenticated, async (req, res) => {
  try {
    // Get the user id from the route parameter
    const userId = req.params.id;

    // Fetch the user data with populated favorites
    const user = await User.findById(userId).populate({
      path: "favorites",
      select: "title category location images createdAt status",
    });

    if (!user) {
      return res.status(404).render("error", {
        message: "User not found",
        error: { status: 404 },
      });
    }

    // Fetch user's active posts
    const posts = await Post.find({
      createdBy: userId,
      status: "active",
    }).sort({ createdAt: -1 });

    // Fetch user's draft posts
    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).sort({ updatedAt: -1 });

    // Transform favorites to match the expected format in the template
    const favorites = user.favorites
      .filter((post) => post.status === "active") // Filter out inactive posts
      .map((post) => {
        return {
          post: post,
          addedAt: post.createdAt, // We don't have the exact date added as favorite
        };
      });

    // Fetch chat data for this user
    // Find all messages where the current user is either sender or recipient
    const currentUserId = req.user._id;

    const sentMessages = await Message.find({ sender: currentUserId })
      .sort({ createdAt: -1 })
      .limit(100);

    const receivedMessages = await Message.find({ recipient: currentUserId })
      .sort({ createdAt: -1 })
      .limit(100);

    // Combine messages and identify unique conversations
    const allMessages = [...sentMessages, ...receivedMessages];

    // Create a map to store unique conversations
    const conversationsMap = new Map();

    // Process each message to extract conversation data
    for (const message of allMessages) {
      // Create a unique key for this conversation
      const otherUserId = message.sender.equals(currentUserId)
        ? message.recipient
        : message.sender;

      // Skip if postId is not valid (prevents errors with malformed data)
      if (!message.postId) continue;

      const key = `${message.postId}_${otherUserId}`;

      // If this conversation is not yet in our map, or if this message is newer
      if (
        !conversationsMap.has(key) ||
        message.createdAt > conversationsMap.get(key).lastMessage.createdAt
      ) {
        // Check if message is unread
        const isUnread = !message.sender.equals(currentUserId) && !message.read;

        conversationsMap.set(key, {
          postId: message.postId,
          userId: otherUserId,
          lastMessage: message,
          unread: isUnread,
        });
      }
    }

    // Convert map to array and resolve user and post details
    const chats = await Promise.all(
      Array.from(conversationsMap.values()).map(async (conv) => {
        try {
          // Get user details
          const otherUser = await User.findById(conv.userId).select(
            "name avatar"
          );

          // Get post details
          const post = await Post.findById(conv.postId).select("title");

          // Skip if either user or post doesn't exist
          if (!otherUser || !post) {
            return null;
          }

          return {
            postId: conv.postId,
            otherUser: {
              _id: otherUser._id,
              name: otherUser.name,
              avatar: otherUser.avatar,
            },
            postTitle: post.title,
            lastMessage: {
              _id: conv.lastMessage._id,
              content: conv.lastMessage.content,
              createdAt: conv.lastMessage.createdAt,
              isUserSender: conv.lastMessage.sender.equals(currentUserId),
            },
            unread: conv.unread,
          };
        } catch (err) {
          console.error("Error processing chat item:", err);
          return null;
        }
      })
    );

    // Filter out null values (from conversations with missing users or posts)
    const validChats = chats.filter((chat) => chat !== null);

    // Sort conversations by last message date (most recent first)
    validChats.sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
    );

    // Render the dashboard template with all the data
    res.render("dashboard", {
      user,
      posts,
      drafts,
      favorites,
      chats: validChats,
      formatTime: (date) => {
        const messageDate = new Date(date);
        const now = new Date();

        // If it's today, show time
        if (messageDate.toDateString() === now.toDateString()) {
          return messageDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        // If it's within a week, show day name
        const dayDiff = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
        if (dayDiff < 7) {
          return messageDate.toLocaleDateString([], { weekday: "short" });
        }

        // Otherwise show date
        return messageDate.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
      },
    });
  } catch (error) {
    console.error("Error rendering dashboard:", error);
    res.status(500).render("error", {
      message: "Error loading dashboard",
      error: { status: 500 },
    });
  }
});

// User drafts page
router.get("/profile/drafts", async (req, res) => {
  try {
    // In a real application, you would use the authenticated user's ID
    const userId = req.user?._id;

    // Fetch complete user data if user is authenticated
    let userData = null;
    if (userId) {
      userData = await User.findById(userId);
    }

    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).sort({ updatedAt: -1 });

    res.render("drafts", {
      drafts,
      user: userData,
    });
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
router.get("/reset/:id/:token", async (req, res) => {
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

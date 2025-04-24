import express from "express";
import {
  uploadImage,
  deleteImage,
  multerUploads,
  singleImageUpload,
} from "./image-upload.mjs";
import postRouter from "./post-routes.mjs";
import uiRouter from "./ui-routes.mjs";
import userRouter from "./user-routes.mjs";
import chatRouter from "./chat-routes.mjs";
import fetch from "node-fetch";
import mongoose from "mongoose";
import { isAuthenticated } from "../middlewares.mjs";
import User from "../mongoose/user.mjs";
import Post from "../mongoose/post.mjs";
import Message from "../mongoose/message.mjs";
import messagesRouter from "./messages.mjs";

const router = express.Router();

//Add body parsing middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

//Upload image route
router.post("/api/upload", multerUploads, uploadImage);

//Specific route for post image uploads - simpler configuration
router.post("/api/posts/upload-image", singleImageUpload, uploadImage);

//Delete image route
router.delete("/api/delete/:public_id", deleteImage);

// Proxy endpoint for neighborhoods to avoid CORS issues
router.get("/api/mahalleler", async (req, res) => {
  try {
    const { iladi, ilce } = req.query;
    if (!iladi || !ilce) {
      return res
        .status(400)
        .json({ error: "City and district parameters are required" });
    }

    // Make request to external API
    const response = await fetch(
      `https://tradres.com.tr/api/mahalleler?iladi=${encodeURIComponent(
        iladi
      )}&ilce=${encodeURIComponent(ilce)}`
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch neighborhoods: ${response.statusText}`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching neighborhoods:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.use("/api/messages", messagesRouter);

// Redirect /chat to /chats for consistency
router.get("/chat", (req, res) => {
  res.redirect("/chats");
});

router.use(postRouter);
router.use(uiRouter);
router.use(userRouter);
router.use(chatRouter);

/**
 * Chat page - shows all conversations
 */
router.get("/chats", isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Find all messages where current user is sender or recipient
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
    })
      .sort({ createdAt: -1 })
      .populate("sender", "name avatar")
      .populate("recipient", "name avatar")
      .populate("postId", "title");

    // Group messages by unique conversation (postId + otherUser)
    const chatMap = new Map();

    messages.forEach((message) => {
      // Determine other party in the conversation
      const isUserSender =
        message.sender._id.toString() === currentUserId.toString();
      const otherUser = isUserSender ? message.recipient : message.sender;
      const postId = message.postId._id.toString();

      // Create a unique key for this conversation
      const chatKey = `${postId}:${otherUser._id}`;

      // Only add the first message for each unique conversation (most recent due to sort)
      if (!chatMap.has(chatKey)) {
        // Check if message is unread
        const isUnread =
          !message.read &&
          message.recipient._id.toString() === currentUserId.toString();

        chatMap.set(chatKey, {
          postId: message.postId._id,
          postTitle: message.postId.title,
          otherUser: {
            _id: otherUser._id,
            name: otherUser.name,
            avatar: otherUser.avatar,
          },
          lastMessage: {
            _id: message._id,
            content: message.content,
            createdAt: message.createdAt,
            isUserSender,
          },
          unread: isUnread,
        });
      }
    });

    // Convert map to array
    const chats = Array.from(chatMap.values());

    // Utility function to format timestamps for the view
    const formatTime = (timestamp) => {
      const date = new Date(timestamp);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.getTime() >= today.getTime()) {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (date.getTime() >= yesterday.getTime()) {
        return "Yesterday";
      } else {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    };

    res.render("chats", {
      user: req.user,
      chats,
      formatTime,
    });
  } catch (error) {
    console.error("Error loading chats page:", error);
    res.status(500).render("error", {
      user: req.user,
      error: "There was a problem loading your conversations",
    });
  }
});

/**
 * Authentication check endpoint
 */
router.get("/api/auth/check", (req, res) => {
  if (req.user) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

export default router;

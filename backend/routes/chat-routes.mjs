import express from "express";
import Message from "../mongoose/message.mjs";
import User from "../mongoose/user.mjs";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import mongoose from "mongoose";

const router = express.Router();

// Get conversation history for a specific post between two users
router.get("/api/chat/:postId/:userId", isAuthenticated, async (req, res) => {
  try {
    const { postId, userId } = req.params;
    const currentUserId = req.user._id;

    // Validate that postId and userId are valid ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(postId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res.status(400).json({ error: "Invalid postId or userId format" });
    }

    // Verify the post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Verify the other user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get messages between the two users for this post
    const messages = await Message.find({
      postId,
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    // Mark messages as read
    await Message.updateMany(
      {
        postId,
        sender: userId,
        recipient: currentUserId,
        read: false,
      },
      { read: true }
    );

    // Add user information to messages
    const messagesWithUser = messages.map((msg) => ({
      ...msg,
      isCurrentUser: msg.sender.toString() === currentUserId.toString(),
    }));

    res.json({
      messages: messagesWithUser,
      currentUser: {
        _id: req.user._id,
        name: req.user.name,
      },
      otherUser: {
        _id: otherUser._id,
        name: otherUser.name,
      },
      post: {
        _id: post._id,
        title: post.title,
      },
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Get all conversations for the current user
router.get("/api/chats", isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Find all messages where the user is either sender or recipient
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    // Group messages by conversation (unique combination of postId and the other user)
    const conversations = {};

    for (const message of messages) {
      const otherUserId =
        message.sender.toString() === currentUserId.toString()
          ? message.recipient.toString()
          : message.sender.toString();

      const conversationKey = `${message.postId}-${otherUserId}`;

      if (!conversations[conversationKey]) {
        conversations[conversationKey] = {
          postId: message.postId,
          userId: otherUserId,
          lastMessage: message,
          unreadCount: 0,
        };
      }

      // Count unread messages from the other user
      if (
        message.recipient.toString() === currentUserId.toString() &&
        !message.read
      ) {
        conversations[conversationKey].unreadCount++;
      }
    }

    // Convert to array and fetch user/post details
    const conversationList = Object.values(conversations);

    // Get user and post details for all conversations
    for (const conversation of conversationList) {
      conversation.user = await User.findById(conversation.userId)
        .select("name")
        .lean();

      conversation.post = await Post.findById(conversation.postId)
        .select("title")
        .lean();
    }

    res.json({ conversations: conversationList });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

export default router;

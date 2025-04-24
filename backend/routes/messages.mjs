import express from "express";
import { isAuthenticated } from "../middlewares.mjs";
import Message from "../mongoose/message.mjs";
import User from "../mongoose/user.mjs";
import Post from "../mongoose/post.mjs";
import mongoose from "mongoose";

const router = express.Router();

/**
 * API endpoint to get unread message count
 */
router.get("/unread/count", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all conversations where the user is the recipient
    const conversations = await Message.find({
      recipient: userId,
    });

    // Count unread messages across all conversations
    let totalUnread = 0;

    for (const conversation of conversations) {
      const unreadCount = conversation.messages.filter(
        (msg) => !msg.read
      ).length;
      totalUnread += unreadCount;
    }

    res.json({ count: totalUnread });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Error fetching unread message count" });
  }
});

/**
 * API endpoint to get all chats for the current user
 */
router.get("/chats", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all conversations where the user is either sender or recipient
    const conversations = await Message.find({
      $or: [{ sender: userId }, { recipient: userId }],
    }).populate([
      {
        path: "sender",
        select: "name avatar",
      },
      {
        path: "recipient",
        select: "name avatar",
      },
      {
        path: "postId",
        select: "title images",
      },
    ]);

    // Prepare chat summaries
    const chatSummaries = [];

    for (const conversation of conversations) {
      if (!conversation.messages || conversation.messages.length === 0) {
        continue;
      }

      // Get most recent message
      const lastMessage =
        conversation.messages[conversation.messages.length - 1];

      // Determine if the current user is the sender of the conversation
      const isCurrentUserSender = conversation.sender._id.equals(userId);
      const otherUser = isCurrentUserSender
        ? conversation.recipient
        : conversation.sender;

      // Count unread messages
      const unreadCount = isCurrentUserSender
        ? 0
        : conversation.messages.filter((msg) => !msg.read).length;

      // Check if post exists, if not, skip this conversation
      if (!conversation.postId) {
        continue;
      }

      // Format post image if available
      const postImage =
        conversation.postId.images && conversation.postId.images.length > 0
          ? conversation.postId.images[0].url
          : null;

      chatSummaries.push({
        postId: conversation.postId._id,
        postTitle: conversation.postId.title,
        postImage: postImage,
        user: {
          _id: otherUser._id,
          name: otherUser.name,
          avatar: otherUser.avatar,
        },
        lastMessage: {
          content: lastMessage.content,
          timestamp: lastMessage.createdAt,
          isRead: lastMessage.read,
        },
        unreadCount: unreadCount,
      });
    }

    // Sort chat summaries by last message timestamp (newest first)
    chatSummaries.sort(
      (a, b) =>
        new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp)
    );

    res.json(chatSummaries);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Error fetching chat summaries" });
  }
});

/**
 * API endpoint to mark messages as read
 */
router.put("/read", isAuthenticated, async (req, res) => {
  try {
    const { postId, senderId } = req.body;
    const currentUserId = req.user._id;

    if (!postId || !senderId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate that postId and senderId are valid ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(postId) ||
      !mongoose.Types.ObjectId.isValid(senderId)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid postId or senderId format" });
    }

    // Find the conversation where senderId is the sender and current user is the recipient
    const conversation = await Message.findOne({
      postId: postId,
      sender: senderId,
      recipient: currentUserId,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Update all unread messages to read
    let updated = false;
    conversation.messages.forEach((msg) => {
      if (!msg.read) {
        msg.read = true;
        updated = true;
      }
    });

    if (updated) {
      await conversation.save();
      return res.json({ success: true });
    } else {
      return res.json({ success: true, info: "No unread messages to update" });
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

/**
 * Get chat messages between current user and another user for a specific post
 * @route GET /:postId/:userId
 * @param {string} postId - ID of the post
 * @param {string} userId - ID of the other user
 * @returns {array} Array of messages
 */
router.get("/:postId/:userId", isAuthenticated, async (req, res) => {
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

    // Validate post exists
    const post = await Post.findById(postId).select("title images");
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Validate other user exists
    const otherUser = await User.findById(userId).select("name avatar");
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Fetch conversation documents between these users for this post
    const conversation = await Message.findOne({
      postId,
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId },
      ],
    });

    // Prepare the messages array with proper format for the frontend
    let formattedMessages = [];

    if (conversation && conversation.messages) {
      // Mark messages from the other user as read
      let updated = false;

      // Mark messages as read if the other user is the sender
      if (conversation.sender.toString() === userId.toString()) {
        conversation.messages.forEach((msg) => {
          if (!msg.read && msg.sentBy.toString() === userId.toString()) {
            msg.read = true;
            updated = true;
          }
        });

        if (updated) {
          await conversation.save();
        }
      }

      // Format messages for frontend
      formattedMessages = conversation.messages.map((msg, index) => {
        // Determine if the current user is the sender of this message
        const sentByStr = msg.sentBy.toString();
        const currentUserIdStr = currentUserId.toString();
        const isCurrentUserMessageSender = sentByStr === currentUserIdStr;

        return {
          _id: msg._id || `temp-${index}`,
          content: msg.content,
          createdAt: msg.createdAt,
          read: msg.read,
          isCurrentUser: isCurrentUserMessageSender,
          sender: {
            _id: isCurrentUserMessageSender ? currentUserId : userId,
            name: isCurrentUserMessageSender ? req.user.name : otherUser.name,
          },
        };
      });
    }

    // Return the complete response expected by the frontend
    return res.json({
      messages: formattedMessages,
      otherUser: {
        _id: otherUser._id,
        name: otherUser.name || "Unknown User",
        avatar: otherUser.avatar || "/img/default-avatar.svg",
      },
      post: {
        _id: post._id,
        title: post.title || "Untitled Post",
        image:
          post.images && post.images.length > 0 ? post.images[0].url : null,
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    console.error("Request params:", req.params);
    console.error("Stack trace:", error.stack);
    return res
      .status(500)
      .json({ error: "Internal server error: " + error.message });
  }
});

export default router;

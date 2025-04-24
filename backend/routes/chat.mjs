import express from "express";
import { isAuthenticated } from "../middlewares.mjs";
import Message from "../mongoose/message.mjs";
import User from "../mongoose/user.mjs";
import Post from "../mongoose/post.mjs";
import mongoose from "mongoose";

const router = express.Router();

/**
 * Route to render the chat page with all conversations
 */
router.get("/messages", isAuthenticated, async (req, res) => {
  try {
    // Find all messages where the current user is either sender or recipient
    const userId = req.user._id;

    // First find all unique conversations (by post and participants)
    const sentMessages = await Message.find({ sender: userId })
      .sort({ createdAt: -1 })
      .limit(100);

    const receivedMessages = await Message.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(100);

    // Combine messages and identify unique conversations
    const allMessages = [...sentMessages, ...receivedMessages];

    // Create a map to store unique conversations
    const conversationsMap = new Map();

    // Process each message to extract conversation data
    for (const message of allMessages) {
      // Create a unique key for this conversation
      const otherUserId = message.sender.equals(userId)
        ? message.recipient
        : message.sender;
      const key = `${message.postId}_${otherUserId}`;

      // If this conversation is not yet in our map, or if this message is newer
      if (
        !conversationsMap.has(key) ||
        message.createdAt > conversationsMap.get(key).lastMessage.createdAt
      ) {
        // Count unread messages
        let unreadCount = 0;
        if (!message.sender.equals(userId) && !message.read) {
          unreadCount = 1;
        }

        conversationsMap.set(key, {
          postId: message.postId,
          userId: otherUserId,
          lastMessage: message,
          unreadCount: unreadCount,
        });
      } else if (!message.sender.equals(userId) && !message.read) {
        // Increment unread count for existing conversation
        const conversation = conversationsMap.get(key);
        conversation.unreadCount += 1;
      }
    }

    // Convert map to array and resolve user and post details
    const conversations = await Promise.all(
      Array.from(conversationsMap.values()).map(async (conv) => {
        // Get user details
        const user = await User.findById(conv.userId).select("name avatar");

        // Get post details
        const post = await Post.findById(conv.postId).select("title");

        return {
          postId: conv.postId,
          user: user,
          post: post,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount,
        };
      })
    );

    // Sort conversations by last message date
    conversations.sort(
      (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt
    );

    // Render the chat page with conversations
    res.render("chats", {
      title: "Your Messages",
      user: req.user,
      chats: conversations,
      formatDate: (date) => {
        return new Date(date).toLocaleString();
      },
    });
  } catch (error) {
    console.error("Error loading chat page:", error);
    res.status(500).send("Error loading messages");
  }
});

/**
 * Get formatted messages for chat UI
 * This route is needed to match the frontend expectations
 * The route in messages.mjs returns raw message data, but this returns UI-friendly format
 */
router.get(
  "/api/messages/:postId/:userId",
  isAuthenticated,
  async (req, res) => {
    try {
      const { postId, userId } = req.params;
      const currentUserId = req.user._id;

      // Validate that postId and userId are valid ObjectIds
      if (
        !mongoose.Types.ObjectId.isValid(postId) ||
        !mongoose.Types.ObjectId.isValid(userId)
      ) {
        return res
          .status(400)
          .json({ error: "Invalid postId or userId format" });
      }

      // Get user details
      const otherUser = await User.findById(userId).select("name avatar");

      if (!otherUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get post details
      const post = await Post.findById(postId).select("title images");

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Find the conversation document
      const conversation = await Message.findOne({
        postId,
        $or: [
          { sender: currentUserId, recipient: userId },
          { sender: userId, recipient: currentUserId },
        ],
      });

      let formattedMessages = [];

      if (conversation && conversation.messages) {
        // Mark messages from the other user as read
        let updated = false;
        // Determine if the other user is the sender or recipient
        const isOtherUserSender = conversation.sender.equals(userId);
        const isCurrentUserSender = conversation.sender.equals(currentUserId);

        // Mark messages as read only if the other user sent them
        if (isOtherUserSender) {
          conversation.messages.forEach((msg) => {
            if (!msg.read) {
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
          // We need to check who the sentBy field refers to, not the conversation sender
          // Handle both ObjectId and string comparison for sentBy
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

      // Create properly formatted response with defaults for null values
      const responseData = {
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
      };

      // Send the response
      res.json(responseData);
    } catch (error) {
      console.error("Error fetching messages:", error);
      console.error("Request params:", req.params);
      console.error("Stack trace:", error.stack);
      res
        .status(500)
        .json({ error: "Error fetching messages: " + error.message });
    }
  }
);

export default router;

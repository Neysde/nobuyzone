import express from "express";
import Message from "../mongoose/message.mjs";
import User from "../mongoose/user.mjs";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import mongoose from "mongoose";
import {
  createOrUpdateConversation,
  getUnreadMessageCount,
  markMessagesAsRead,
} from "../utils/chat-utils.mjs";

const router = express.Router();

/**
 * Helper function to format and return conversation data
 */
async function getFormattedConversation(
  req,
  res,
  postId,
  userId,
  conversation
) {
  try {
    const currentUserId = req.user._id;

    // Get post details if not already provided
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Get other user details if not already provided
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    let formattedMessages = [];

    if (conversation && conversation.messages) {
      // Messages are already marked as read in the route handler
      // Format each message for frontend
      formattedMessages = conversation.messages.map((msg, index) => {
        const sentByStr = msg.sentBy.toString();
        const currentUserIdStr = currentUserId.toString();
        const isCurrentUserMessageSender = sentByStr === currentUserIdStr; //it stores boolean in isCurrentUserMessageSender

        return {
          _id: msg._id || `temp-${index}`,
          content: msg.content,
          createdAt: msg.createdAt,
          read: msg.read,
          isCurrentUser: isCurrentUserMessageSender,
          sender: {
            _id: isCurrentUserMessageSender ? currentUserId : userId,
            name: isCurrentUserMessageSender
              ? `${req.user.firstName} ${req.user.lastName}`
              : `${otherUser.firstName} ${otherUser.lastName}`,
            avatar: isCurrentUserMessageSender
              ? req.user.profilePicture.url
              : otherUser.profilePicture.url,
          },
        };
      });
    }

    //Create properly formatted response
    const responseData = {
      messages: formattedMessages,
      otherUser: {
        _id: otherUser._id,
        name: `${otherUser.firstName} ${otherUser.lastName}` || "Unknown User",
        avatar: otherUser.profilePicture.url || "/img/default-avatar.svg",
      },
      post: {
        _id: post._id,
        title: post.title || "Untitled Post",
        image:
          post.images && post.images.length > 0 ? post.images[0].url : null,
      },
    };

    return res.json(responseData);
  } catch (error) {
    console.error("Error in getFormattedConversation:", error);
    return res
      .status(500)
      .json({ error: "Error processing conversation data" });
  }
}

/**
 * API endpoint to get unread message count
 */
router.get("/api/messages/unread/count", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    //Use the shared utility function
    const totalUnread = await getUnreadMessageCount(userId);

    res.json({ count: totalUnread });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Error fetching unread message count" });
  }
});

/**
 * Get conversation history for a specific post between two users
 * This replaces the /api/chat/:postId/:userId route which was deleted
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

      // Get messages between the two users for this post
      const conversation = await Message.findOne({
        postId,
        "users.user": { $all: [currentUserId, userId] },
      });

      // Mark messages as read when user enters the chat
      if (conversation) {
        await markMessagesAsRead({
          currentUserId,
          senderId: userId,
          postId,
        });
      }

      return await getFormattedConversation(
        req,
        res,
        postId,
        userId,
        conversation
      );
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  }
);

/**
 * Get all chats/conversations for the current user
 */
router.get("/api/chats", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all conversations where the user is involved
    const conversations = await Message.find({
      "users.user": userId,
    }).sort({ updatedAt: -1 });

    //Prepare chat summaries
    const chatSummaries = [];

    for (const conversation of conversations) {
      if (!conversation.messages || conversation.messages.length === 0) {
        continue;
      }

      // Get the post ID
      const postId = conversation.postId;

      // Get post details
      const post = await Post.findById(postId);


      //Get the other user's ID
      const otherUserId = conversation.users
        .map((u) => u.user.toString())
        .find((id) => id !== userId.toString());

      //Get other user details
      const otherUser = await User.findById(otherUserId);

      // Get most recent message
      const lastMessage =
        conversation.messages[conversation.messages.length - 1];

      // Count unread messages from the other user
      const unreadCount = conversation.messages.filter(
        (msg) => !msg.read && msg.sentBy.toString() === otherUserId
      ).length;

      //Format post image if available
      const postImage =
        post && post.images && post.images.length > 0 ? post.images[0].url : null;

      // Determine if the last message was sent by the current user
      const lastMessageSentByCurrentUser =
        lastMessage.sentBy.toString() === userId.toString();

      chatSummaries.push({
        postId: post ? post._id : postId, // Use original postId from conversation if post is null
        postTitle: post ? post.title : "İlan Artık Mevcut Değil", // Default title if post is null
        postImage: postImage,
        user: {
          _id: otherUser._id,
          name: `${otherUser.firstName} ${otherUser.lastName}`,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          username: otherUser.username,
          avatar:
            otherUser.profilePicture && otherUser.profilePicture.url
              ? otherUser.profilePicture.url
              : "/img/default-avatar.svg",
          showUsername: otherUser.showUsername,
        },
        lastMessage: {
          content: lastMessage.content,
          timestamp: lastMessage.createdAt,
          isRead: lastMessage.read,
          sentByCurrentUser: lastMessageSentByCurrentUser,
        },
        unreadCount: unreadCount,
      });
    }

    //Sort chat summaries by last message timestamp (newest first)
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
 * Create a new conversation or send message to existing one
 * Message is received from req.body.message sent from the client
 * This endpoint is called when a user submits a message from the chat interface
 */
router.post("/api/chat/:postId", isAuthenticated, async (req, res) => {
  try {
    const { postId } = req.params;
    const { message } = req.body; // message comes from the form or JSON data sent by client
    const currentUserId = req.user._id;

    // Validate required data
    if (!postId || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate that postId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: "Invalid postId format" });
    }

    // Find the post to get the post owner
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Get post owner ID
    const postOwnerId = post.createdBy;

    // Prevent sending messages to yourself
    if (postOwnerId.toString() === currentUserId.toString()) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    //Use the shared utility function to create or update the conversation
    const conversation = await createOrUpdateConversation({
      userId: currentUserId,
      otherUserId: postOwnerId,
      postId,
      content: message,
    });

    // Get the saved message
    const savedMessage =
      conversation.messages[conversation.messages.length - 1];

    // Return success response with conversation details
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      conversationId: conversation._id,
      messageId: savedMessage._id,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

/**
 * Mark messages as read
 * Requires postId and senderId in request body
 * Used by the client-side code to mark messages as read when manually triggered
 */
router.put("/api/messages/read", isAuthenticated, async (req, res) => {
  try {
    const { postId, senderId } = req.body; // These values come from client-side form/JSON data
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

    // Use the shared utility function
    const updated = await markMessagesAsRead({
      currentUserId,
      senderId,
      postId,
    });

    if (updated) {
      return res.json({ success: true });
    } else {
      return res.json({ success: true, info: "No unread messages to update" });
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Error marking messages as read" });
  }
});

export default router;

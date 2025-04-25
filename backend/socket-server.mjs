import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./mongoose/user.mjs";
import Message from "./mongoose/message.mjs";
import Post from "./mongoose/post.mjs";
import { isAuthenticated } from "./middlewares.mjs"; // Import the middleware
import {
  createOrUpdateConversation,
  getUnreadMessageCount,
  markMessagesAsRead,
} from "./utils/chat-utils.mjs";

/**
 * Socket.IO Server Implementation for Real-time Chat
 *
 * This module implements a real-time chat system using Socket.IO with these key features:
 *
 * 1. Real-time messaging: Uses bidirectional socket events for instant message delivery
 *    - send-message: Client emits this to send a message
 *    - receive-message: Server emits this to clients when new messages arrive
 *    - new-message: Legacy event name maintained for backward compatibility
 *
 * 2. Message history: Client can request previously missed messages
 *    - request-messages: Client emits this to fetch message history since a timestamp
 *    - missed-messages: Server emits this with the requested message history
 *
 * 3. Read receipts: Tracks when messages are read
 *    - mark-read/message-read: Client emits when messages are viewed
 *    - messages-read: Server emits to notify senders their messages were read
 *
 * 4. Typing indicators: Shows when a user is typing
 *    - typing: Client emits when user is typing
 *    - user-typing: Server emits to notify recipients
 *
 * 5. Unread counts: Tracks unread message counts
 *    - init-chats: Client emits to get unread counts
 *    - unread-count: Server emits with the count
 *
 * The system uses room-based messaging to ensure messages are delivered to the right recipients:
 * - Personal rooms (user:{userId}): For user-specific notifications
 * - Chat rooms (chat:{postId}:{userId1}:{userId2}): For specific conversations
 *
 * Messages are stored in the database for persistence but delivered in real-time through
 * socket events without requiring additional database queries for online users.
 */

/**
 * Initializes Socket.IO server for chat functionality
 * @param {Object} httpServer - HTTP server to attach Socket.IO
 * @returns {Object} - Configured Socket.IO server instance
 */
export function initializeSocketServer(httpServer) {
  // Initialize Socket.IO server with CORS configuration
  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Modified Socket.IO middleware for authentication using our existing middleware
  io.use(async (socket, next) => {
    try {
      // Extract token from handshake or cookie
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.cookie?.split("login=")[1]?.split(";")[0];

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      // Create a mock request object for the middleware
      const req = {
        cookies: { login: token },
        user: null, // Will be set by the middleware
      };

      // Create mock response and next function
      const res = {
        redirect: () => {
          return next(new Error("Authentication failed"));
        },
      };

      // Custom next function to handle middleware result
      const middlewareNext = async (err) => {
        if (err) {
          return next(new Error("Authentication error"));
        }

        if (!req.user) {
          return next(new Error("Authentication failed"));
        }

        // Get complete user data if firstName or lastName is missing
        if (!req.user.firstName || !req.user.lastName) {
          try {
            console.log(`Getting complete user data for ${req.user._id}`);
            const completeUser = await User.findById(req.user._id);
            if (completeUser) {
              // Merge the complete user data with the existing user data
              req.user = {
                ...req.user,
                firstName: completeUser.firstName,
                lastName: completeUser.lastName,
              };
            }
          } catch (dbError) {
            console.error("Error getting complete user data:", dbError);
            // Continue even if we can't get the complete user data
          }
        }

        // Attach user to socket
        socket.user = req.user;
        next();
      };

      // Use isAuthenticated middleware
      isAuthenticated(req, res, middlewareNext);
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication error"));
    }
  });

  // Socket.IO connection handling
  io.on("connection", async (socket) => {
    // Log more detailed user information for debugging
    console.log(
      `User connected to chat: ${socket.user.name} (${socket.user._id})`
    );
    console.log(`User object structure:`, {
      hasFirstName: !!socket.user.firstName,
      hasLastName: !!socket.user.lastName,
      name: socket.user.name,
      id: socket.user._id,
      // Don't log the full user object to avoid exposing sensitive data
    });

    // Join a user-specific room for private messages
    socket.join(`user:${socket.user._id}`);

    // Handle joining a chat room for a specific post/conversation
    socket.on("join-chat", async ({ postId, userId }) => {
      const roomId = `chat:${postId}:${socket.user._id}:${userId}`;
      socket.join(roomId);
      console.log(`${socket.user.name} joined chat room ${roomId}`);

      // Mark messages as read when user enters the chat room
      try {
        const updated = await markMessagesAsRead({
          currentUserId: socket.user._id,
          senderId: userId,
          postId,
        });

        if (updated) {
          console.log(
            `Marked messages as read for user ${socket.user._id} in chat with ${userId} for post ${postId}`
          );
          // Notify the sender that their messages were read
          io.to(`user:${userId}`).emit("messages-read", {
            postId,
            userId: socket.user._id,
          });
        }
      } catch (error) {
        console.error("Error marking messages as read on join:", error);
      }
    });

    // Handle sending a message
    socket.on("send-message", async (messageData) => {
      try {
        const { postId, recipientId, content } = messageData;

        if (!postId || !recipientId || !content) {
          socket.emit("error", { message: "Missing required fields" });
          return;
        }

        // Use the shared utility function
        const conversation = await createOrUpdateConversation({
          userId: socket.user._id,
          otherUserId: recipientId,
          postId,
          content,
        });

        // Get the newly added message (last one in the array)
        const savedMessage =
          conversation.messages[conversation.messages.length - 1];

        // Prepare message data for sending
        const messageToSend = {
          _id: savedMessage._id,
          content: savedMessage.content,
          sentBy: savedMessage.sentBy,
          postId, // Add postId to the message for client-side routing
          sender: {
            _id: socket.user._id,
            name: socket.user.name,
          },
          createdAt: savedMessage.createdAt,
          isCurrentUser: true,
        };

        // Prepare message data for recipient
        const messageForRecipient = {
          ...messageToSend,
          isCurrentUser: false,
        };

        // Send to sender's room
        const senderRoom = `chat:${postId}:${socket.user._id}:${recipientId}`;
        socket.to(senderRoom).emit("receive-message", messageToSend);

        // Send to recipient's room
        const recipientRoom = `chat:${postId}:${recipientId}:${socket.user._id}`;
        io.to(recipientRoom).emit("receive-message", messageForRecipient);

        // Send to recipient's user-specific room (for notifications)
        io.to(`user:${recipientId}`).emit("receive-message", {
          ...messageForRecipient,
          isNotification: true, // Add flag to indicate this is a notification message
        });

        // Also emit with legacy event name for backward compatibility
        socket.to(senderRoom).emit("new-message", messageToSend);
        io.to(recipientRoom).emit("new-message", messageForRecipient);

        // Send notification to recipient
        io.to(`user:${recipientId}`).emit("notification", {
          type: "new-message",
          message: `New message from ${socket.user.name}`,
          sender: {
            _id: socket.user._id,
            name: socket.user.name,
          },
          postId,
        });

        // Acknowledge the message was sent
        socket.emit("message-sent", {
          messageId: savedMessage._id,
          content: savedMessage.content, // Include content in acknowledgement
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });

    // Handle message typing indicator
    socket.on("typing", async ({ postId, recipientId }) => {
      try {
        if (!postId || !recipientId) {
          return; // Skip if missing required data
        }

        // Extract the CURRENT user's name (the one who is typing)
        // This is what we want to send to the recipient
        let firstName = "Someone";
        let lastName = "";

        // Try to extract firstName and lastName from user data
        if (socket.user) {
          if (socket.user.firstName && socket.user.lastName) {
            // Direct properties exist
            firstName = socket.user.firstName;
            lastName = socket.user.lastName;
          } else if (socket.user.name) {
            // Try to extract from name
            const nameParts = socket.user.name.split(" ");
            if (nameParts.length >= 2) {
              firstName = nameParts[0];
              lastName = nameParts.slice(1).join(" ");
            } else if (nameParts.length === 1) {
              firstName = nameParts[0];
            }
          }
        }

        console.log(
          `Typing indicator: User ${socket.user._id} (${firstName} ${lastName}) is typing - sending to recipient ${recipientId}`
        );

        // Get recipient room
        const recipientRoom = `chat:${postId}:${recipientId}:${socket.user._id}`;

        // Create user typing data to send - this contains the current user's details
        // so the recipient knows WHO is typing
        const typingData = {
          userId: socket.user._id, // ID of the user who is typing
          postId: postId,
          firstName: socket.user.firstName, // First name of the user who is typing
          lastName: socket.user.lastName, // Last name of the user who is typing
        };

        // Send to recipient's chat room
        io.to(recipientRoom).emit("user-typing", typingData);

        // Also send to recipient's personal room
        io.to(`user:${recipientId}`).emit("user-typing", typingData);
      } catch (error) {
        console.error("Error sending typing indicator:", error);
      }
    });
  });

  return io;
}

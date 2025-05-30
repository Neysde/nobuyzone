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

  // Store active user rooms to prevent duplicate joins
  const userRooms = {};

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

        try {
          // Ensure user ID exists - sometimes it's in 'id' instead of '_id'
          if (!req.user._id && req.user.id) {
            req.user._id = req.user.id;
          }

          // Always try to get complete user data to ensure we have all needed fields
          let completeUser = null;
          if (req.user._id) {
            completeUser = await User.findById(req.user._id);
          } else if (req.user.id) {
            completeUser = await User.findById(req.user.id);
          } else if (req.user.email) {
            completeUser = await User.findOne({ email: req.user.email });
          }

          if (completeUser) {
            // Ensure the user has an _id field
            req.user._id = completeUser._id || req.user._id || req.user.id;

            // Merge the complete user data with the existing user data
            req.user = {
              ...req.user,
              _id: req.user._id, // Maintain existing _id or use the one from completeUser
              firstName: completeUser.firstName || req.user.firstName,
              lastName: completeUser.lastName || req.user.lastName,
              username: completeUser.username || req.user.username,
              showUsername: completeUser.showUsername || req.user.showUsername,
            };

            // Ensure the name is set
            if (!req.user.name) {
              if (req.user.firstName || req.user.lastName) {
                req.user.name = `${req.user.firstName || ""} ${
                  req.user.lastName || ""
                }`.trim();
              } else {
                req.user.name = `User ${req.user._id.toString().substr(-6)}`;
              }
            }
          } else {
            console.warn(
              `Could not find complete user data for user`
            );
          }
        } catch (dbError) {
          console.error("Error getting complete user data:", dbError);
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
    // Ensure user ID and name are available
    if (!socket.user._id && socket.user.id) {
      // Some authentication systems use 'id' instead of '_id'
      socket.user._id = socket.user.id;
    } else if (!socket.user._id && !socket.user.id) {
      console.error(
        "User connected without a valid ID. Authentication may be misconfigured."
      );
      socket.disconnect(true);
    }

    // Ensure user name is available
    if (!socket.user.name) {
      // Try to construct name from firstName and lastName
      if (socket.user.firstName || socket.user.lastName) {
        socket.user.name = `${socket.user.firstName || ""} ${
          socket.user.lastName || ""
        }`.trim();
      } else {
        // Fallback to a generic name with user ID
        socket.user.name = `User ${
          (socket.user._id.toString() || "").substr(-6) || "unknown"
        }`;
      }
    }

    // Log more detailed user information for debugging

      // Don't log the full user object to avoid exposing sensitive data

    // Get the user ID consistently
    const currentUserId = socket.user._id || socket.user.id;

    // Initialize user's rooms set in the tracking object
    userRooms[currentUserId] = userRooms[currentUserId] || new Set();

    // Join a user-specific room for private messages
    socket.join(`user:${currentUserId}`);
    userRooms[currentUserId].add(`user:${currentUserId}`);

    // Handle socket disconnection
    socket.on("disconnect", () => {

      // Clean up room tracking on disconnect
      delete userRooms[currentUserId];
    });

    // Handle joining a user's personal notification room
    socket.on("join-user-room", ({ userId }) => {
      // Ensure the user can only join their own notification room
      const currentUserId = socket.user._id || socket.user.id;

      if (!currentUserId) {
        console.error("Cannot join user room: Invalid user ID");
        socket.emit("error", {
          message: "Authentication error: Invalid user ID",
        });
        return;
      }

      // For security, only allow users to join their own personal room
      if (userId !== currentUserId.toString()) {
        console.error(
          `User ${currentUserId} attempted to join another user's room: ${userId}`
        );
        return;
      }

      const userRoom = `user:${currentUserId}`;

      // Check if already in room
      if (userRooms[currentUserId] && userRooms[currentUserId].has(userRoom)) {

        return;
      }

      // Join the room
      socket.join(userRoom);
      userRooms[currentUserId] = userRooms[currentUserId] || new Set();
      userRooms[currentUserId].add(userRoom);


      // Send initial unread count
      getUnreadMessageCount(currentUserId)
        .then((count) => {
          socket.emit("unread-count", { count });
        })
        .catch((error) => {
          console.error("Error getting initial unread count:", error);
        });
    });

    // Handle joining a chat room for a specific post/conversation
    socket.on("join-chat", async ({ postId, userId }) => {
      // Ensure we have a valid user ID
      const currentUserId = socket.user._id || socket.user.id;

      if (!currentUserId) {
        console.error("Cannot join chat: User has no valid ID");
        socket.emit("error", {
          message: "Authentication error: Invalid user ID",
        });
        return;
      }

      const roomId = `chat:${postId}:${currentUserId}:${userId}`;

      // Check if the user is already in this room
      if (userRooms[currentUserId] && userRooms[currentUserId].has(roomId)) {
        // User is already in the room, no need to join again

        return;
      }

      // Join the room since the user is not already in it
      socket.join(roomId);
      userRooms[currentUserId] = userRooms[currentUserId] || new Set();
      userRooms[currentUserId].add(roomId);


      // Mark messages as read when user enters the chat room
      try {
        const updated = await markMessagesAsRead({
          currentUserId: currentUserId,
          senderId: userId,
          postId,
        });

        if (updated) {

          // Notify the sender that their messages were read
          io.to(`user:${userId}`).emit("messages-read", {
            postId,
            userId: currentUserId,
          });

          // Update unread count for current user
          try {
            const unreadCount = await getUnreadMessageCount(currentUserId);
            io.to(`user:${currentUserId}`).emit("unread-count", {
              count: unreadCount,
            });
          } catch (error) {
            console.error(
              "Error sending unread count after marking messages as read:",
              error
            );
          }
        }
      } catch (error) {
        console.error("Error marking messages as read on join:", error);
      }
    });

    // Handle leaving a chat room
    socket.on("leave-chat", async ({ postId, recipientId }) => {
      try {
        const currentUserId = socket.user._id || socket.user.id;

        if (!currentUserId) {
          console.error(
            "Cannot leave chat room: User has no valid ID (socket.user._id is missing)"
          );
          socket.emit("error", {
            message: "Kimlik doğrulama hatası: Sohbetten çıkmak için geçersiz kullanıcı kimliği.",
          });
          return;
        }

        if (!postId || !recipientId) {
          console.error(
            `Cannot leave chat room: Missing postId or recipientId. Received postId: ${postId}, recipientId: ${recipientId}`
          );
          socket.emit("error", {
            message: "Sohbet odasından çıkmak için geçersiz parametreler.",
          });
          return;
        }

        // Construct the room ID. The order of user IDs in the room name needs to be consistent.
        // We'll assume the server always constructs it with the smaller ID first, or uses a consistent order.
        // For simplicity, let's use the same format as join-chat implies (current user, then other user)
        // However, it's crucial that this matches how rooms are named and tracked.
        // The join-chat event uses `chat:${postId}:${currentUserId}:${userId}` where userId is the other person.
        // So, when leaving, postId, currentUserId, and recipientId (the other person) are used.
        const roomId = `chat:${postId}:${currentUserId}:${recipientId}`;
        const alternativeRoomId = `chat:${postId}:${recipientId}:${currentUserId}`; // In case the order was swapped

        // Leave the room
        socket.leave(roomId);
        socket.leave(alternativeRoomId); // Attempt to leave both possible room name orders


        if (roomId !== alternativeRoomId) {

        }

        // Update userRooms tracking
        if (userRooms[currentUserId]) {
          const initialSize = userRooms[currentUserId].size;
          userRooms[currentUserId].delete(roomId);
          userRooms[currentUserId].delete(alternativeRoomId);
          const finalSize = userRooms[currentUserId].size;
          if (initialSize > finalSize) {

          } else {

          }
        } else {
          console.warn(
            `User ${currentUserId} not found in userRooms tracking during leave-chat.`
          );
        }
      } catch (error) {
        console.error("Error handling leave-chat event:", error);
        socket.emit("error", {
          message: "Sohbet odasından çıkmaya çalışırken sunucu hatası.",
        });
      }
    });

    // Handle sending a message
    socket.on("send-message", async (messageData) => {
      try {
        const { postId, recipientId, content } = messageData;

        if (!postId || !recipientId || !content) {
          socket.emit("error", {
            message: "Gerekli alanlar eksik",
          });
          return;
        }

        // Ensure we have a valid user ID
        const currentUserId = socket.user._id || socket.user.id;

        if (!currentUserId) {
          console.error("Cannot send message: User has no valid ID");
          socket.emit("error", {
            message: "Kimlik doğrulama hatası: Geçersiz kullanıcı kimliği",
          });
          return;
        }

        // Use the shared utility function
        const conversation = await createOrUpdateConversation({
          userId: currentUserId,
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
            _id: currentUserId,
            name:
              socket.user.name ||
              `User ${
                (currentUserId.toString() || "").substr(-6) || "unknown"
              }`,
            firstName: socket.user.firstName,
            lastName: socket.user.lastName,
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
        const senderRoom = `chat:${postId}:${currentUserId}:${recipientId}`;
        socket.to(senderRoom).emit("receive-message", messageToSend);

        // Send to recipient's room
        const recipientRoom = `chat:${postId}:${recipientId}:${currentUserId}`;
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
          message: `${socket.user.name || "bir kullanıcı"}'dan yeni mesaj`,
          sender: {
            _id: currentUserId,
            name:
              socket.user.name ||
              `User ${
                (currentUserId.toString() || "").substr(-6) || "unknown"
              }`,
          },
          postId,
        });

        // Update unread count for recipient
        try {
          const unreadCount = await getUnreadMessageCount(recipientId);
          io.to(`user:${recipientId}`).emit("unread-count", {
            count: unreadCount,
          });
        } catch (error) {
          console.error("Error sending unread count:", error);
        }

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

        // Ensure we have a valid user ID
        const currentUserId = socket.user._id || socket.user.id;

        if (!currentUserId) {
          console.error("Cannot send typing indicator: User has no valid ID");
          return;
        }

        // Check the user's privacy settings
        let firstName = "";
        let lastName = "";
        let username = socket.user.username || "";
        let showUsername = socket.user.showUsername;

        // If showUsername is true, we'll only send the username
        if (!showUsername) {
          // Extract the CURRENT user's name (the one who is typing)
          // This is what we want to send to the recipient
          firstName = socket.user.firstName || "";
          lastName = socket.user.lastName || "";

          // If firstName/lastName are not available, try to parse from name
          if (!firstName && !lastName && socket.user.name) {
            const nameParts = socket.user.name.split(" ");
            if (nameParts.length >= 2) {
              firstName = nameParts[0];
              lastName = nameParts.slice(1).join(" ");
            } else if (nameParts.length === 1) {
              firstName = nameParts[0];
            }
          }
        }

        // Ensure we have at least something to display
        if (!firstName && !lastName) {
          firstName = "Birisi";
        }



        // Get recipient room
        const recipientRoom = `chat:${postId}:${recipientId}:${currentUserId}`;

        // Create user typing data to send - this contains the current user's details
        // so the recipient knows WHO is typing
        const typingData = {
          userId: currentUserId, // ID of the user who is typing
          postId: postId,
          firstName: firstName, // First name of the user who is typing
          lastName: lastName, // Last name of the user who is typing
          username: username, // Username of the user who is typing
          showUsername: showUsername, // Flag to indicate if only username should be shown
        };

        // Also send to recipient's personal room
        io.to(`user:${recipientId}`).emit("user-typing", typingData);
      } catch (error) {
        console.error("Error sending typing indicator:", error);
      }
    });

    // Handle marking messages as read
    socket.on("mark-messages-as-read", async ({ postId, senderId }) => {
      try {
        // Ensure we have a valid user ID
        const currentUserId = socket.user._id || socket.user.id;

        if (!currentUserId || !postId || !senderId) {
          console.error("Invalid parameters for marking messages as read");
          return;
        }

        // Mark messages as read
        const updated = await markMessagesAsRead({
          currentUserId,
          senderId,
          postId,
        });

        if (updated) {
          // Notify the sender that their messages were read
          io.to(`user:${senderId}`).emit("messages-read", {
            postId,
            userId: currentUserId,
          });

          // Update unread count for current user
          try {
            const unreadCount = await getUnreadMessageCount(currentUserId);
            io.to(`user:${currentUserId}`).emit("unread-count", {
              count: unreadCount,
            });
          } catch (error) {
            console.error(
              "Error sending unread count after marking messages as read:",
              error
            );
          }
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    // Legacy handler for backward compatibility
    socket.on("message-read", async ({ messageId, postId, senderId }) => {
      try {
        // Ensure we have a valid user ID
        const currentUserId = socket.user._id || socket.user.id;

        if (!currentUserId || !postId || !senderId) {
          console.error("Invalid parameters for marking message as read");
          return;
        }

        // Mark messages as read
        const updated = await markMessagesAsRead({
          currentUserId,
          senderId,
          postId,
        });

        if (updated) {
          // Notify the sender that their messages were read
          io.to(`user:${senderId}`).emit("messages-read", {
            postId,
            userId: currentUserId,
          });

          // Update unread count for current user
          try {
            const unreadCount = await getUnreadMessageCount(currentUserId);
            io.to(`user:${currentUserId}`).emit("unread-count", {
              count: unreadCount,
            });
          } catch (error) {
            console.error(
              "Error sending unread count after marking message as read:",
              error
            );
          }
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });
  });

  return io;
}

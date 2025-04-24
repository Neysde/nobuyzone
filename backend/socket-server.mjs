import { Server } from "socket.io";
import { createClient } from "redis";
import jwt from "jsonwebtoken";
import User from "./mongoose/user.mjs";
import Message from "./mongoose/message.mjs";
import { isAuthenticated } from "./middlewares.mjs"; // Import the middleware

/**
 * Initializes Socket.IO server with Redis for chat functionality
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

  let redisClient;

  // Setup Redis client with error handling and fallback
  try {
    redisClient = createClient({
      url: "redis://localhost:6379", // Use default Redis port to avoid connection issues
      socket: {
        reconnectStrategy: (retries) => {
          // Retry with exponential backoff, max 5 retries
          if (retries > 5) {
            console.log(
              "Redis connection failed after 5 retries. Using Socket.IO without Redis."
            );
            return false; // Stop trying to reconnect
          }
          return Math.min(retries * 100, 3000); // Increasing delay, max 3 seconds
        },
      },
    });

    redisClient.on("error", (err) => {
      console.log("Redis Client Error:", err);
      // Continue operation without Redis if there's an error
    });

    // Connect to Redis
    (async () => {
      try {
        await redisClient.connect();
        console.log("Socket server connected to Redis");
      } catch (err) {
        console.error("Redis connection error, continuing without Redis:", err);
        // Continue without Redis
      }
    })();
  } catch (error) {
    console.error("Failed to initialize Redis client:", error);
    // Continue without Redis
  }

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
      const middlewareNext = (err) => {
        if (err) {
          return next(new Error("Authentication error"));
        }

        if (!req.user) {
          return next(new Error("Authentication failed"));
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
    console.log(
      `User connected to chat: ${socket.user.name} (${socket.user._id})`
    );

    // Join a user-specific room for private messages
    socket.join(`user:${socket.user._id}`);

    // Handle joining a chat room for a specific post/conversation
    socket.on("join-chat", async ({ postId, userId }) => {
      const roomId = `chat:${postId}:${socket.user._id}:${userId}`;
      socket.join(roomId);
      console.log(`${socket.user.name} joined chat room ${roomId}`);

      // Store online status in Redis if available
      if (redisClient && redisClient.isReady) {
        try {
          await redisClient.set(`online:${socket.user._id}`, "true", {
            EX: 3600,
          }); // expires in 1 hour
        } catch (error) {
          console.error("Error setting online status in Redis:", error);
        }
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

        // Create a new message object
        const newMessage = {
          content,
          sentBy: socket.user._id,
          createdAt: new Date(),
          read: false,
        };

        // Find existing conversation or create a new one
        let conversation = await Message.findOne({
          postId,
          $or: [
            { sender: socket.user._id, recipient: recipientId },
            { sender: recipientId, recipient: socket.user._id },
          ],
        });

        if (conversation) {
          // Add new message to existing conversation
          conversation.messages.push(newMessage);
          await conversation.save();
        } else {
          // Create new conversation with first message
          conversation = new Message({
            sender: socket.user._id,
            recipient: recipientId,
            postId,
            messages: [newMessage],
          });
          await conversation.save();
        }

        // Get the newly added message (last one in the array)
        const savedMessage =
          conversation.messages[conversation.messages.length - 1];

        // Prepare message data for sending
        const messageToSend = {
          _id: savedMessage._id,
          content: savedMessage.content,
          sentBy: savedMessage.sentBy,
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
        socket.to(senderRoom).emit("new-message", messageToSend);

        // Send to recipient's room
        const recipientRoom = `chat:${postId}:${recipientId}:${socket.user._id}`;
        io.to(recipientRoom).emit("new-message", messageForRecipient);

        // Send to recipient's user-specific room (for notifications)
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
        socket.emit("message-sent", { messageId: savedMessage._id });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle marking messages as read
    socket.on("mark-read", async ({ postId, senderId }) => {
      try {
        // Find the conversation
        const conversation = await Message.findOne({
          postId,
          sender: senderId,
          recipient: socket.user._id,
        });

        if (conversation) {
          // Mark all unread messages as read
          let updated = false;
          conversation.messages.forEach((msg) => {
            if (!msg.read) {
              msg.read = true;
              updated = true;
            }
          });

          if (updated) {
            await conversation.save();
          }

          // Notify the sender that messages were read
          io.to(`user:${senderId}`).emit("messages-read", {
            by: socket.user._id,
            postId,
          });
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    // Handle user typing
    socket.on("typing", ({ postId, recipientId }) => {
      const room = `chat:${postId}:${recipientId}:${socket.user._id}`;
      socket.to(room).emit("user-typing", { userId: socket.user._id, postId });
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log(`User disconnected from chat: ${socket.user.name}`);

      // Remove online status if Redis is available
      if (redisClient && redisClient.isReady) {
        try {
          await redisClient.del(`online:${socket.user._id}`);
        } catch (error) {
          console.error("Error removing online status from Redis:", error);
        }
      }
    });
  });

  return io;
}

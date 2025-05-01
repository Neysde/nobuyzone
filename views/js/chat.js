/**
 * Chat Module for Barter App
 * Handles client-side chat functionality using Socket.IO
 * Optimized for compatibility with the updated backend implementation
 */

// Chat functionality will be initialized when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Check if there's a chat container in the current page
  if (document.getElementById("chat-container")) {
    // Initialize the chat module
    // Note: This only sets up the DOM elements and event listeners
    // Socket connection will be established on-demand when user opens a chat
    Chat.initialize();
  }

  // Track if an openChat event is being processed
  let isProcessingOpenChat = false;

  // Track the current chat being processed to prevent duplicate handling
  let currentProcessingChatId = null;

  // Add page visibility listeners to manage socket connections
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      // Page is hidden, user has navigated away
      if (Chat.isSocketConnected && !Chat.isInActiveChat()) {
        // If socket is connected but no active chat, start inactivity timer
        Chat.startInactivityTimer();
      }
    } else if (document.visibilityState === "visible") {
      // Page is visible again, user has returned
      if (Chat.isInActiveChat()) {
        // If user is in an active chat, ensure connection
        Chat.ensureSocketConnection();
      }
    }
  });

  // Listen for events from other pages (like post-detail)
  document.addEventListener("openChat", function (event) {
    const { postId, recipientId, recipientName, avatar, postTitle } =
      event.detail;

    // Create a unique identifier for this chat conversation
    const chatIdentifier = `${postId}:${recipientId}`;

    // Prevent duplicate event handling for the same chat
    if (isProcessingOpenChat && currentProcessingChatId === chatIdentifier) {
      console.log("Already processing this chat, ignoring duplicate event");
      return;
    }

    // Check if this chat is already open with the same participants
    if (Chat.isCurrentChat && Chat.isCurrentChat(postId, recipientId)) {
      console.log("This chat is already open, just focusing it");
      Chat.focusChat && Chat.focusChat();
      return;
    }

    isProcessingOpenChat = true;
    currentProcessingChatId = chatIdentifier;

    console.log(`Processing chat open request: ${chatIdentifier}`);

    // Load the chat component if it's not already loaded
    Chat.loadChatComponent()
      .then(() => {
        Chat.openChat(postId, recipientId, recipientName, avatar, postTitle);

        // Reset the flags after a short delay
        setTimeout(() => {
          isProcessingOpenChat = false;
          currentProcessingChatId = null;
          // Also reset the global flag from post-detail.js if it exists
          if (typeof window.isOpeningChat !== "undefined") {
            window.isOpeningChat = false;
          }
        }, 1000);
      })
      .catch(() => {
        isProcessingOpenChat = false;
        currentProcessingChatId = null;
        // Also reset the global flag from post-detail.js if it exists
        if (typeof window.isOpeningChat !== "undefined") {
          window.isOpeningChat = false;
        }
      });
  });
});

// Chat Module using revealing module pattern
const Chat = (function () {
  // Private variables
  let socket;
  let currentPostId = "";
  let currentRecipientId = "";
  let typingTimeout;
  let isAuthenticated = false;
  let currentUser = null;
  let chatComponentLoaded = false;
  // Socket inactivity tracking
  let socketInactivityTimeout = null;
  let socketInactivityDuration = 120000; // 2 minutes in milliseconds
  let isChatActive = false;

  // DOM Elements
  let chatContainer;
  let chatHeader;
  let chatMessages;
  let chatInput;
  let chatSendBtn;
  let chatCloseBtn;
  let chatEmptyState;
  let chatTyping;
  let chatRecipientName;
  let chatPostTitle;
  let chatAvatar;
  let chatButtons;
  let typingName;

  /**
   * Load the chat component dynamically if not already in the page
   * @returns {Promise} - Resolves when component is loaded
   */
  async function loadChatComponent() {
    if (chatComponentLoaded) {
      return Promise.resolve();
    }

    // If the chat container already exists, just initialize it
    if (document.getElementById("chat-container")) {
      chatComponentLoaded = true;
      return Promise.resolve();
    }

    try {
      // Fetch the chat component
      const response = await fetch("/chat.ejs");
      if (!response.ok) {
        throw new Error(`Failed to load chat component: ${response.status}`);
      }

      // Get the component HTML
      const html = await response.text();

      // Create a temporary container and add the component HTML
      const tempContainer = document.createElement("div");
      tempContainer.innerHTML = html;

      // Append the component to the body
      document.body.appendChild(tempContainer);

      // Mark as loaded
      chatComponentLoaded = true;

      return Promise.resolve();
    } catch (error) {
      console.error("Error loading chat component:", error);
      return Promise.reject(error);
    }
  }

  /**
   * Initialize the chat module
   */
  function initialize() {
    // Find all DOM elements
    chatContainer = document.getElementById("chat-container");
    chatHeader = document.getElementById("chat-header");
    chatMessages = document.getElementById("chat-messages");
    chatInput = document.getElementById("chat-input");
    chatSendBtn = document.getElementById("chat-send-btn");
    chatCloseBtn = document.getElementById("chat-close-btn");
    chatEmptyState = document.getElementById("chat-empty-state");
    chatTyping = document.getElementById("chat-typing");
    chatRecipientName = document.getElementById("chat-recipient-name");
    chatPostTitle = document.getElementById("chat-post-title");
    chatAvatar = document.getElementById("chat-avatar")?.querySelector("img");
    typingName = document.querySelector(".typing-name");

    // Find all in-app chat buttons
    chatButtons = document.querySelectorAll(
      '.contact-method-btn[data-method="in-app"]'
    );

    // If chat isn't available or not on a page with chat, return early
    if (!chatContainer) {
      console.log("Chat container not found, skipping chat initialization");
      return;
    }

    // Set up event listeners for chat components
    setupEventListeners();

    // Check authentication status but don't establish socket connection
    // Socket connection will be established on-demand when a chat is opened
    checkAuthentication();

    // Mark as loaded
    chatComponentLoaded = true;
  }

  /**
   * Set up event listeners for chat components
   */
  function setupEventListeners() {
    // Add click event to all in-app chat buttons
    if (chatButtons && chatButtons.length) {
      chatButtons.forEach((button) => {
        button.addEventListener("click", async (e) => {
          e.preventDefault();
          const postId = button.getAttribute("data-post-id");
          const sellerId = button.getAttribute("data-seller-id");
          const sellerName =
            button.getAttribute("data-seller-name") || "Seller";
          const postTitle = button.getAttribute("data-post-title") || "Item";
          const sellerAvatar =
            button.getAttribute("data-seller-avatar") ||
            "/img/default-avatar.svg";

          // If not logged in, handle redirection to login
          if (!isAuthenticated) {
            const authenticated = await checkAuthentication();
            if (!authenticated) {
              redirectToLogin();
              return;
            }
          }

          // Open chat with this seller for this post
          openChat(postId, sellerId, sellerName, sellerAvatar, postTitle);
        });
      });
    }

    // Chat input event listeners
    if (chatInput) {
      chatInput.addEventListener("input", () => {
        // Get the trimmed input value
        const value = chatInput.value.trim();

        // Enable/disable send button based on input
        chatSendBtn.disabled = value.length === 0;

        //Emit typing event if input has text
        if (value.length > 0) {
          emitTyping();
        } else {
          // If the input is now empty, hide the typing indicator immediately
          if (chatTyping) {
            chatTyping.style.display = "none";
          }
        }
      });

      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!chatSendBtn.disabled) {
            sendMessage();
          }
        }
      });
    }

    // Chat control button event listeners
    if (chatSendBtn) {
      chatSendBtn.addEventListener("click", () => {
        sendMessage();
      });
    }

    if (chatCloseBtn) {
      chatCloseBtn.addEventListener("click", () => {
        closeChat();
      });
    }

    // Allow dragging the chat window by its header
    if (chatContainer && chatHeader) {
      makeDraggable(chatContainer, chatHeader);
    }

    // Make chat list items clickable if we're on a page with chat list
    const chatListItems = document.querySelectorAll(".chat-list-item");
    if (chatListItems && chatListItems.length) {
      chatListItems.forEach((item) => {
        item.addEventListener("click", function () {
          const postId = this.dataset.postId;
          const recipientId = this.dataset.recipientId;
          const recipient = this.dataset.recipient;
          const avatar = this.dataset.avatar;
          const postTitle = this.dataset.postTitle;

          // If the chat item was unread, remove the unread class
          if (this.classList.contains("unread")) {
            this.classList.remove("unread");
          }

          // Open chat with this user for this post
          openChat(postId, recipientId, recipient, avatar, postTitle);
        });
      });
    }
  }

  /**
   * Check if user is authenticated and redirect to login if not
   */
  async function checkAuthentication() {
    try {
      const response = await fetch("/api/check-auth", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        isAuthenticated = true;
        currentUser = data.user;
        // Don't automatically initialize socket connection
        // Socket will be initialized on-demand when user opens a chat
        return true;
      } else {
        // Prepare to redirect to login
        isAuthenticated = false;
        return false;
      }
    } catch (error) {
      console.error("Error checking authentication:", error);
      return false;
    }
  }

  /**
   * Redirect to login page with return URL
   */
  function redirectToLogin() {
    const returnUrl = encodeURIComponent(window.location.pathname);
    window.location.href = `/api/login?returnTo=${returnUrl}`;
  }

  /**
   * Initialize Socket.IO connection
   * @returns {boolean} - Whether the connection was successfully initialized
   */
  function initializeSocketConnection() {
    if (!isAuthenticated) {
      console.warn(
        "Not initializing socket connection - user not authenticated"
      );
      showNotification(
        "Chat service is currently unavailable. Please try again later.",
        "error"
      );
      return false;
    }

    // Check if Socket.IO library is loaded
    if (typeof io === "undefined") {
      console.error(
        "Socket.IO library not loaded. Chat functionality will be disabled."
      );
      showNotification(
        "Chat service is currently unavailable. Please try again later.",
        "error"
      );
      return false;
    }

    try {
      // If socket exists and is connected, no need to reinitialize
      if (socket && socket.connected) {
        console.log("Socket already connected, skipping initialization");
        return true;
      }

      // Clean up any previous socket instance
      if (socket) {
        console.log("Cleaning up previous socket connection");
        try {
          socket.disconnect();
        } catch (e) {
          console.error("Error disconnecting old socket:", e);
        }
      }

      console.log("Initializing new socket connection");

      // Initialize socket connection with proper options
      socket = io({
        auth: {
          token: document.cookie.replace(
            /(?:(?:^|.*;\s*)login\s*\=\s*([^;]*).*$)|^.*$/,
            "$1"
          ),
        },
        transports: ["websocket", "polling"], // Try WebSocket first, then fall back to polling
        reconnectionAttempts: 10, // Increase reconnection attempts
        reconnectionDelay: 1000, // Start with 1 second delay
        reconnectionDelayMax: 5000, // Maximum delay of 5 seconds
        timeout: 20000, // Longer timeout for initial connection
        autoConnect: true, // Automatically connect
      });

      // Basic connection event listeners
      socket.on("connect", () => {
        console.log("Connected to chat server");

        // Clear any previous error notifications
        const errorNotification = document.querySelector(".notification.error");
        if (errorNotification) {
          errorNotification.remove();
        }

        // Initialize unread message count
        socket.emit("init-chats");

        // Join current chat room if we have one open
        if (currentPostId && currentRecipientId) {
          console.log("Rejoining chat room after reconnect");
          socket.emit("join-chat", {
            postId: currentPostId,
            userId: currentRecipientId,
          });

          // Request any messages that might have been missed while disconnected
          requestMissedMessages();
        } else {
          // If no active chat, start the inactivity timer
          if (!isChatActive) {
            startSocketInactivityTimer();
          }
        }
      });

      socket.on("connect_error", (error) => {
        console.error("Connection error:", error);
        showNotification(
          "Failed to connect to chat server. Please refresh the page to try again.",
          "error"
        );
      });

      socket.on("disconnect", (reason) => {
        console.log(`Disconnected from chat server: ${reason}`);

        // If the disconnection was initiated by the server, try to reconnect
        if (reason === "io server disconnect") {
          // The disconnection was initiated by the server, need to reconnect manually
          setTimeout(() => {
            socket.connect();
          }, 1000);
        }
        // else the socket will automatically try to reconnect
      });

      socket.on("reconnect_attempt", (attemptNumber) => {
        console.log(`Attempting to reconnect: attempt ${attemptNumber}`);
      });

      socket.on("reconnect", (attemptNumber) => {
        console.log(`Successfully reconnected after ${attemptNumber} attempts`);

        // Rejoin chat room if there's an active chat
        if (currentPostId && currentRecipientId) {
          console.log("Rejoining chat room after reconnect");
          socket.emit("join-chat", {
            postId: currentPostId,
            userId: currentRecipientId,
          });

          // Request any messages that might have been missed during disconnection
          requestMissedMessages();
        }
      });

      socket.on("reconnect_failed", () => {
        console.error(
          "Failed to reconnect to the chat server after multiple attempts"
        );
        showNotification(
          "Connection to chat server lost. Please refresh the page.",
          "error"
        );
      });

      // Set up all message-related event handlers
      setupSocketEventHandlers();

      return true;
    } catch (error) {
      console.error("Error initializing Socket.IO connection:", error);
      showNotification(
        "Chat service is currently unavailable. Please try again later.",
        "error"
      );
      return false;
    }
  }

  /**
   * Set up socket event handlers for message reception, typing indicators, etc.
   */
  function setupSocketEventHandlers() {
    if (!socket) return;

    // Handler for sent messages acknowledgment
    socket.on("message-sent", (data) => {
      // Store message content before clearing input
      const messageContent = chatInput.value.trim();

      // Clear the input immediately
      chatInput.value = "";
      // Also reset send button state
      chatSendBtn.disabled = true;

      // Clear any pending timeout for displaying the message locally
      if (window.lastMessageTimeout) {
        clearTimeout(window.lastMessageTimeout);
        window.lastMessageTimeout = null;
      }

      // Add your own message to the chat UI
      const sentMessage = {
        _id: data.messageId || `temp-${Date.now()}`,
        content: data.content || messageContent, // Use data.content if available, fallback to stored content
        createdAt: new Date(),
        isCurrentUser: true,
      };

      console.log("Adding sent message to chat UI");

      addMessageToChat(sentMessage);

      // Scroll to bottom to ensure new message is visible
      scrollToBottom();
    });

    //NEW HANDLER: Dedicated handler for receiving new messages
    socket.on("receive-message", (message) => {
      console.log("Received message via dedicated channel");

      // Extract post ID and sender ID from the message, ensuring all possible formats
      const messagePostId = message.postId;
      const messageSenderId =
        message.sender?._id || message.senderId || message.sentBy;

      // Don't process if essential data is missing
      if (!messagePostId || !messageSenderId) {
        console.error("Received message with missing essential data", message);
        return;
      }

      // Check if this message belongs to the current open chat
      if (
        messagePostId === currentPostId &&
        messageSenderId === currentRecipientId
      ) {
        // Format the message properly for display
        const formattedMessage = {
          _id: message._id || `received-${Date.now()}`,
          content: message.content,
          createdAt: message.createdAt || new Date(),
          isCurrentUser: false,
        };

        console.log("Adding received message to chat UI");

        // Add message to chat UI
        addMessageToChat(formattedMessage);

        // Mark messages as read immediately
        markMessagesAsRead();

        // Scroll to bottom to ensure new message is visible
        scrollToBottom();

        // Send read receipt to sender
        socket.emit("message-read", {
          messageId: message._id,
          postId: messagePostId,
          senderId: messageSenderId,
        });
      } else {
        // Message is for a different chat, show notification
        const senderName =
          message.sender?.name || message.senderName || "Someone";
        showNotification(`New message from ${senderName}`, "info");

        // Update unread count
        socket.emit("init-chats");
      }
    });

    // Legacy handler for backward compatibility
    socket.on("new-message", (message) => {
      console.log("Received message via legacy channel");

      // Extract post ID and sender ID from the message, with fallbacks
      const messagePostId = message.postId || "";
      const messageSenderId =
        message.sender?._id || message.senderId || message.sentBy || "";

      // Check if this message belongs to the current open chat
      const isForCurrentChat =
        // Check if post IDs match
        messagePostId &&
        messagePostId === currentPostId &&
        // Check various sender ID possibilities
        messageSenderId &&
        (messageSenderId === currentRecipientId ||
          // Also check if the sender ID is in the users array (MongoDB sometimes nests objects)
          (message.users &&
            message.users.some(
              (u) =>
                (u.user &&
                  (u.user === currentRecipientId ||
                    u.user._id === currentRecipientId)) ||
                u === currentRecipientId
            )));

      if (isForCurrentChat) {
        // Format the message properly for display
        const formattedMessage = {
          _id: message._id || `received-${Date.now()}`,
          content: message.content || message.text || "",
          createdAt: message.createdAt || new Date(),
          isCurrentUser: message.isCurrentUser === true ? true : false,
        };

        // Actually add message to chat UI
        addMessageToChat(formattedMessage);

        // Mark messages as read
        markMessagesAsRead();

        // Scroll to bottom to ensure new message is visible
        scrollToBottom();
      } else {
        // Otherwise, show a notification
        const senderName =
          message.sender?.name || message.senderName || "Someone";
        showNotification(`New message from ${senderName}`, "info");

        // Update unread count
        socket.emit("init-chats");
      }
    });

    socket.on("user-typing", ({ userId, postId, firstName, lastName }) => {
      // Log received typing indicator data for debugging
      console.log("Received typing indicator from another user:", {
        userId, // ID of the OTHER person who is typing
        postId,
        firstName, // First name of the OTHER person who is typing
        lastName, // Last name of the OTHER person who is typing
        fullName:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || "Someone",
      });

      // Only show typing indicator if it's from the current chat partner we're talking with
      if (userId === currentRecipientId && postId === currentPostId) {
        // The typing indicator should show the OTHER person's name (the one who is typing)
        // firstName and lastName are the sender's details, not the current user's
        showTypingIndicator(firstName, lastName);
      }
    });

    socket.on("messages-read", ({ postId, userId }) => {
      // Update UI to show messages as read if needed
      if (postId === currentPostId && userId === currentRecipientId) {
        // Mark messages as read in UI if needed
        const unreadMessages = document.querySelectorAll(".message-unread");
        unreadMessages.forEach((msg) => {
          msg.classList.remove("message-unread");
        });
      }
    });

    socket.on("unread-count", ({ count }) => {
      // Update UI to show unread count
      updateUnreadCount(count);
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
      showNotification(error.message || "An error occurred", "error");
    });
  }

  /**
   * Request any messages that might have been missed while disconnected
   * This actively fetches messages instead of relying on passive reception
   */
  function requestMissedMessages() {
    if (!socket || !socket.connected || !currentPostId || !currentRecipientId)
      return;

    console.log("Requesting any missed messages");

    // Request messages since the last message timestamp we have
    const lastMessageTime = getLastMessageTimestamp();

    socket.emit("request-messages", {
      postId: currentPostId,
      userId: currentRecipientId,
      since: lastMessageTime || new Date(0), // Use epoch if no messages
    });
  }

  /**
   * Get the timestamp of the last message in the current chat
   * @returns {Date|null} The timestamp of the last message or null if no messages
   */
  function getLastMessageTimestamp() {
    // Find all message timestamps in the DOM
    const timestamps = [];
    const messageElements = document.querySelectorAll(".chat-message");

    messageElements.forEach((message) => {
      const timeElement = message.querySelector(".chat-message-time");
      if (timeElement) {
        // Try to extract timestamp from data attribute if available
        const timestamp = timeElement.getAttribute("data-timestamp");
        if (timestamp) {
          timestamps.push(new Date(timestamp));
        }
      }
    });

    // Sort timestamps in descending order and return the most recent
    if (timestamps.length > 0) {
      timestamps.sort((a, b) => b - a);
      return timestamps[0];
    }

    return null;
  }

  /**
   * Update unread message count in UI
   * @param {number} count - Number of unread messages
   */
  function updateUnreadCount(count) {
    // Update badge in UI if it exists
    const unreadBadge = document.querySelector(".messages-badge");
    if (unreadBadge) {
      if (count > 0) {
        unreadBadge.textContent = count > 99 ? "99+" : count;
        unreadBadge.style.display = "flex";
      } else {
        unreadBadge.style.display = "none";
      }
    }
  }

  /**
   * Open chat with a specific user for a specific post
   * @param {string} postId - The ID of the post
   * @param {string} recipientId - The ID of the user to chat with
   * @param {string} recipientName - Optional name of the recipient
   * @param {string} avatar - Optional avatar URL
   * @param {string} postTitle - Optional post title
   */
  async function openChat(
    postId,
    recipientId,
    recipientName,
    avatar,
    postTitle
  ) {
    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      const authenticated = await checkAuthentication();
      if (!authenticated) {
        redirectToLogin();
        return;
      }
    }

    // Mark chat as active and clear any inactivity timer
    isChatActive = true;
    if (socketInactivityTimeout) {
      clearTimeout(socketInactivityTimeout);
      socketInactivityTimeout = null;
    }

    // Ensure socket connection is established when opening a chat
    if (!socket || !socket.connected) {
      console.log("Initializing socket connection for chat");
      initializeSocketConnection();

      // Wait for socket connection to be established
      if (!socket || !socket.connected) {
        // Try to wait for connection
        let connectionAttempts = 0;
        while ((!socket || !socket.connected) && connectionAttempts < 3) {
          console.log(
            `Waiting for socket connection... Attempt ${connectionAttempts + 1}`
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
          connectionAttempts++;
        }
      }

      // Final check if connection was established
      if (!socket || !socket.connected) {
        showNotification(
          "Could not connect to chat server. Please try again later.",
          "error"
        );
        return;
      }
    }

    console.log("Opening chat:", { postId, recipientId, recipientName });

    // Check if we're already in this chat
    const isSameChat =
      currentPostId === postId && currentRecipientId === recipientId;
    if (isSameChat) {
      console.log("Already in this chat, just focusing it");
      // Just focus the chat window
      chatContainer.classList.add("open");
      chatContainer.style.display = "flex";
      chatInput.focus();
      return;
    }

    // Set current chat parameters
    currentPostId = postId;
    currentRecipientId = recipientId;

    // Clear previous messages
    clearChat();

    // Join the chat room for this conversation
    console.log(
      `Joining chat room for post ${postId} with user ${recipientId}`
    );
    socket.emit("join-chat", { postId, userId: recipientId });

    // Track the room ID for debugging
    const chatRoomId = `chat:${postId}:${currentUser?._id}:${recipientId}`;
    socket.currentChatRoom = chatRoomId;

    // If recipient details are provided, use them directly
    if (recipientName && (avatar || postTitle)) {
      const userData = {
        name: recipientName,
        avatar: avatar || "/img/default-avatar.svg",
      };

      const postData = {
        title: postTitle || "Post",
      };

      // Update chat header with provided information
      updateChatHeader(userData, postData);
    }

    // Load conversation history
    loadChatHistory(postId, recipientId);

    // Show the chat container
    chatContainer.classList.add("open");
    chatContainer.style.display = "flex";

    // Focus the input field
    setTimeout(() => {
      chatInput.focus();
    }, 300);

    // Set up a periodic check to ensure we're still in the chat room
    // but only if there's not already an interval running
    if (window.chatRoomCheckInterval) {
      clearInterval(window.chatRoomCheckInterval);
      window.chatRoomCheckInterval = null;
    }

    // Only set up the periodic check if we're in a chat
    if (currentPostId && currentRecipientId) {
      window.chatRoomCheckInterval = setInterval(() => {
        // Only attempt to rejoin if socket is connected but we're not in a room
        if (socket && socket.connected && currentPostId && currentRecipientId) {
          // We don't need to check every 30 seconds, as the server will now track room membership
          // Just ensure we're in the room every 2 minutes
          console.log("Periodic chat room check - ensuring membership");
          socket.emit("join-chat", {
            postId: currentPostId,
            userId: currentRecipientId,
          });
        } else {
          // If conditions changed, clear the interval
          clearInterval(window.chatRoomCheckInterval);
          window.chatRoomCheckInterval = null;
        }
      }, 120000); // Check every 2 minutes instead of 30 seconds
    }
  }

  /**
   * Load chat history from the server
   * @param {string} postId - The ID of the post
   * @param {string} userId - The ID of the other user
   */
  async function loadChatHistory(postId, userId) {
    try {
      showLoadingState();

      // Validate parameters
      if (!postId || !userId) {
        console.error("Invalid parameters for loadChatHistory", {
          postId,
          userId,
        });
        showNotification("Could not load chat: missing parameters", "error");
        return;
      }

      const response = await fetch(`/api/messages/${postId}/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.status === 401) {
        // Unauthorized, redirect to login
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to load chat history: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("Received chat data:", {
        messageCount: data.messages?.length || 0,
        hasUserData: !!data.otherUser,
        hasPostData: !!data.post,
      });

      // Update UI with user info
      updateChatHeader(data.otherUser, data.post);

      // Add messages to the chat
      if (data.messages && data.messages.length > 0) {
        hideEmptyState();

        // Clear existing messages to avoid duplicates
        if (chatMessages) {
          chatMessages.innerHTML = "";
        }

        // Process and add each message
        data.messages.forEach((message) => {
          // Format message properly before adding
          const formattedMessage = {
            _id:
              message._id ||
              `hist-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 9)}`,
            content: message.content || message.text || "",
            createdAt: message.createdAt || new Date(),
            // Determine if this is the current user's message
            isCurrentUser:
              message.senderId !== userId && message.sender?._id !== userId,
            read: message.read || false,
          };

          // Only add messages with content
          if (formattedMessage.content) {
            addMessageToChat(formattedMessage);
          }
        });

        // Scroll to the bottom
        scrollToBottom();
      } else {
        console.log("No messages found in conversation");
        showEmptyState();
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      showEmptyState();
      showNotification(
        `Failed to load chat history: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Update the chat header with user information
   * @param {Object} user - The other user in the conversation
   * @param {Object} post - The post being discussed
   */
  function updateChatHeader(user, post) {
    // Safety check for undefined user or post
    if (!user) {
      user = { name: "Unknown User", avatar: "/img/default-avatar.svg" };
    }

    if (!post) {
      post = { title: "Unknown Post" };
    }

    // Set user name with fallback
    chatRecipientName.textContent = user.name || "Unknown User";

    // Set avatar with fallback
    if (chatAvatar) {
      chatAvatar.src = user.avatar || "/img/default-avatar.svg";
      chatAvatar.alt = user.name || "User";
    }

    // Set post title with fallback
    if (chatPostTitle) {
      chatPostTitle.textContent = post.title || "Untitled Post";
    }
  }

  /**
   * Add a message to the chat UI
   * @param {Object} message - The message to add
   */
  function addMessageToChat(message) {
    if (!chatMessages) return;

    // Skip if message has no content
    if (!message || !message.content) {
      console.warn("Attempted to add message with no content:", message);
      return;
    }

    hideEmptyState();

    // Check if this message is already in the chat (avoid duplicates)
    if (message._id) {
      const existingMessage = document.querySelector(
        `[data-message-id="${message._id}"]`
      );
      if (existingMessage) {
        console.log(
          "Message already exists in chat, not adding duplicate:",
          message._id
        );
        return;
      }
    }

    const messageElement = document.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.classList.add(
      message.isCurrentUser ? "outgoing" : "incoming"
    );

    // Add message ID as data attribute if available
    if (message._id) {
      messageElement.setAttribute("data-message-id", message._id);
    }

    // Format the date
    const messageDate = new Date(message.createdAt);
    const formattedTime = messageDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Add read status class if the message is unread and from the current user
    const readStatusClass =
      message.isCurrentUser && !message.read ? "message-unread" : "";

    // Make sure message content is properly escaped
    const safeContent = escapeHtml(message.content);

    messageElement.innerHTML = `
      <div class="chat-message-content">${safeContent}</div>
      <div class="chat-message-time ${readStatusClass}" data-timestamp="${messageDate.toISOString()}">${formattedTime}</div>
    `;

    chatMessages.appendChild(messageElement);

    // Scroll to bottom
    scrollToBottom();
  }

  /**
   * Send a message to the current recipient
   */
  function sendMessage() {
    const message = chatInput.value.trim();

    if (!message || !socket || !socket.connected) {
      return;
    }

    console.log("Sending message:", {
      postId: currentPostId,
      recipientId: currentRecipientId,
      content: message,
    });

    // Disable input and button while sending
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    try {
      // Store the message content for local display in case the socket event doesn't include it
      const messageContent = message;

      // Send message via socket
      socket.emit("send-message", {
        postId: currentPostId,
        recipientId: currentRecipientId,
        content: messageContent,
      });

      // Clear the input field immediately after sending
      chatInput.value = "";

      // If socket doesn't emit a message-sent event within 500ms, display locally
      const messageTimeout = setTimeout(() => {
        // Check if the message is already displayed (message-sent event already handled)
        const messageElements = chatMessages.querySelectorAll(
          ".chat-message-content"
        );
        const messageExists = Array.from(messageElements).some(
          (el) => el.textContent === messageContent
        );

        if (!messageExists) {
          console.log(
            "Message-sent event not received, displaying message locally"
          );
          const localMessage = {
            _id: `local-${Date.now()}`,
            content: messageContent,
            createdAt: new Date(),
            isCurrentUser: true,
          };
          addMessageToChat(localMessage);
        }
      }, 500);

      // Store the timeout ID to clear it if message-sent event is received
      window.lastMessageTimeout = messageTimeout;
    } catch (error) {
      console.error("Error sending message:", error);
      showNotification("Failed to send message. Please try again.", "error");
    } finally {
      // Re-enable input and keep button disabled until new input is entered
      chatInput.disabled = false;
      chatSendBtn.disabled = true;
      chatInput.focus();
    }
  }

  /**
   * Mark messages as read
   */
  function markMessagesAsRead() {
    if (socket && currentRecipientId && currentPostId) {
      socket.emit("mark-read", {
        postId: currentPostId,
        senderId: currentRecipientId,
      });
    }
  }

  /**
   * Show the typing indicator with the name of the person typing
   * @param {string} firstName - The first name of the person typing (NOT the current user)
   * @param {string} lastName - The last name of the person typing (NOT the current user)
   */
  function showTypingIndicator(firstName, lastName) {
    if (!chatTyping) return;

    // Find typing name element if not already cached
    if (!typingName) {
      typingName = chatTyping.querySelector(".typing-name");
      if (!typingName) return;
    }

    // Create the full name with proper handling of undefined/null values
    let fullName = "Someone";

    if (firstName && lastName) {
      // Both first and last name available - format as "FirstName LastName"
      fullName = `${firstName} ${lastName}`.trim();
    } else if (firstName) {
      // Only first name available
      fullName = firstName.trim();
    } else if (lastName) {
      // Only last name available (unlikely but handled for completeness)
      fullName = lastName.trim();
    }

    // Set the full name directly
    typingName.textContent = fullName;

    // Log for debugging
    console.log(`Showing typing indicator for user: ${fullName}`);

    // Make typing indicator visible with simple display style
    chatTyping.style.display = "block";

    // Clear previous timeout if exists
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Hide the typing indicator after 3 seconds
    typingTimeout = setTimeout(() => {
      chatTyping.style.display = "none";
    }, 3000);
  }

  /**
   * Emit typing event to the server
   */
  function emitTyping() {
    if (socket && currentRecipientId && currentPostId) {
      socket.emit("typing", {
        postId: currentPostId,
        recipientId: currentRecipientId,
      });
    }
  }

  /**
   * Show loading state in the chat
   */
  function showLoadingState() {
    if (!chatMessages) return;

    chatMessages.innerHTML = `
      <div class="chat-loading">
        <div class="loading-spinner"></div>
        <p>Loading messages...</p>
      </div>
    `;
  }

  /**
   * Show empty state in the chat
   */
  function showEmptyState() {
    if (!chatEmptyState) return;
    chatEmptyState.style.display = "flex";
  }

  /**
   * Hide empty state in the chat
   */
  function hideEmptyState() {
    if (!chatEmptyState) return;
    chatEmptyState.style.display = "none";
  }

  /**
   * Clear all messages from the chat
   */
  function clearChat() {
    if (!chatMessages || !chatEmptyState) return;

    chatMessages.innerHTML = "";
    chatEmptyState.style.display = "flex";
  }

  /**
   * Close the chat window
   */
  function closeChat() {
    if (!chatContainer) return;

    chatContainer.classList.remove("open");
    chatContainer.style.display = "none";

    // Clear any periodic chat room check interval
    if (window.chatRoomCheckInterval) {
      clearInterval(window.chatRoomCheckInterval);
      window.chatRoomCheckInterval = null;
    }

    // Clear chat content
    clearChat();

    // Reset current chat IDs
    const oldPostId = currentPostId;
    const oldRecipientId = currentRecipientId;
    currentPostId = "";
    currentRecipientId = "";

    // Mark chat as inactive and start the socket inactivity timer
    isChatActive = false;
    startSocketInactivityTimer();

    // Log for debugging
    console.log("Chat closed and state reset");

    // Clear current chat room tracking
    if (socket && socket.currentChatRoom) {
      socket.currentChatRoom = null;
    }
  }

  /**
   * Scroll the chat window to the bottom
   */
  function scrollToBottom() {
    if (!chatMessages) return;

    // Use a slight delay to ensure all content is rendered
    setTimeout(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // For some browsers/conditions, the above may not work reliably
      // Force scroll with another approach as fallback
      if (chatMessages.lastElementChild) {
        chatMessages.lastElementChild.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    }, 50);
  }

  /**
   * Display a notification to the user
   * @param {string} message - The message to display
   * @param {string} type - The type of notification (info, success, error)
   */
  function showNotification(message, type = "info") {
    // Check if the showNotification function exists globally
    if (typeof window.showNotification === "function") {
      window.showNotification(message, type);
    } else {
      // Fallback notification if the global function is not available
      console.log(`${type.toUpperCase()}: ${message}`);

      // Create notification element
      const notification = document.createElement("div");
      notification.className = `notification ${type}`;
      notification.textContent = message;

      // Add notification to the document
      document.body.appendChild(notification);

      // Show notification with animation
      setTimeout(() => {
        notification.classList.add("show");
      }, 10);

      // Hide and remove after 3 seconds
      setTimeout(() => {
        notification.classList.remove("show");

        // Remove from DOM after animation
        setTimeout(() => {
          notification.remove();
        }, 300);
      }, 3000);
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} html - The string to escape
   * @returns {string} - The escaped string
   */
  function escapeHtml(html) {
    const div = document.createElement("div");
    div.textContent = html;
    return div.innerHTML;
  }

  /**
   * Make an element draggable
   * @param {HTMLElement} element - Element to make draggable
   * @param {HTMLElement} handle - Element to use as drag handle
   */
  function makeDraggable(element, handle) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    if (!handle || !element) return;
    handle.addEventListener("mousedown", dragMouseDown);

    function dragMouseDown(e) {
      e.preventDefault();
      // Get mouse cursor position at startup
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.addEventListener("mouseup", closeDragElement);
      document.addEventListener("mousemove", elementDrag);
    }

    function elementDrag(e) {
      e.preventDefault();
      // Calculate new cursor position
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // Set element's new position
      element.style.top = element.offsetTop - pos2 + "px";
      element.style.left = element.offsetLeft - pos1 + "px";
      // Ensure chat stays within viewport
      keepInViewport(element);
    }

    function closeDragElement() {
      // Stop moving when mouse button is released
      document.removeEventListener("mouseup", closeDragElement);
      document.removeEventListener("mousemove", elementDrag);
    }

    function keepInViewport(element) {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Keep within horizontal bounds
      if (rect.left < 0) {
        element.style.left = "0px";
      } else if (rect.right > viewportWidth) {
        element.style.left = viewportWidth - rect.width + "px";
      }

      // Keep within vertical bounds
      if (rect.top < 0) {
        element.style.top = "0px";
      } else if (rect.bottom > viewportHeight) {
        element.style.top = viewportHeight - rect.height + "px";
      }
    }
  }

  /**
   * Start the socket inactivity timer that will disconnect the socket
   * after a period of inactivity when not in a chat
   */
  function startSocketInactivityTimer() {
    // Clear any existing timeout
    if (socketInactivityTimeout) {
      clearTimeout(socketInactivityTimeout);
      socketInactivityTimeout = null;
    }

    // If chat is active, don't set a timer
    if (isChatActive) {
      console.log("Chat is active, not setting inactivity timer");
      return;
    }

    // Set a new timeout
    console.log(
      `Setting socket inactivity timer for ${
        socketInactivityDuration / 1000
      } seconds`
    );
    socketInactivityTimeout = setTimeout(() => {
      // If socket exists and is connected
      if (socket && socket.connected) {
        // Only disconnect if not in a chat
        if (!isChatActive && !currentPostId && !currentRecipientId) {
          console.log("Disconnecting socket due to inactivity");
          // Disconnect the socket
          socket.disconnect();
          socket = null;
        }
      }
    }, socketInactivityDuration);
  }

  // Public API
  return {
    initialize: initialize,
    openChat: openChat,
    loadChatComponent: loadChatComponent,
    isCurrentChat: function (postId, recipientId) {
      return (
        currentPostId === postId &&
        currentRecipientId === recipientId &&
        chatContainer?.classList.contains("open")
      );
    },
    focusChat: function () {
      if (chatContainer) {
        chatContainer.classList.add("open");
        chatContainer.style.display = "flex";

        chatInput?.focus();
        scrollToBottom();
      }
    },
    // Methods for socket management
    isSocketConnected: function () {
      return socket && socket.connected;
    },
    isInActiveChat: function () {
      return isChatActive && currentPostId && currentRecipientId;
    },
    startInactivityTimer: function () {
      startSocketInactivityTimer();
    },
    ensureSocketConnection: function () {
      if (!socket || !socket.connected) {
        initializeSocketConnection();
      }
    },
  };
})();

// Make Chat available globally for other scripts that may need it
window.Chat = Chat;

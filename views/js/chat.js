/**
 * Chat Module for Barter App
 * Handles client-side chat functionality using Socket.IO
 */

// Chat functionality will be initialized when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the chat module
  Chat.initialize();

  // Listen for events from other pages (like post-detail)
  document.addEventListener("openChat", function (event) {
    const { postId, recipientId, recipientName, avatar, postTitle } =
      event.detail;
    Chat.openChat(postId, recipientId, recipientName, avatar, postTitle);
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

  // DOM Elements
  let chatContainer;
  let chatHeader;
  let chatMessages;
  let chatInput;
  let chatSendBtn;
  let chatCloseBtn;
  let chatMinimizeBtn;
  let chatEmptyState;
  let chatTyping;
  let chatRecipientName;
  let chatPostTitle;
  let chatAvatar;
  let chatButtons;
  let typingName;

  /**
   * Initialize the chat module
   */
  function initialize(config) {
    // Use provided config or find elements by ID
    if (config) {
      chatContainer = config.chatContainer;
      chatMessages = config.chatMessages;
      chatInput = config.chatInput;
      chatSendBtn = config.chatSendBtn;
      chatCloseBtn = config.chatCloseBtn;
      chatMinimizeBtn = config.chatMinimizeBtn;
      chatAvatar = config.chatAvatar;
      chatRecipientName = config.chatRecipientName;
      chatPostTitle = config.chatPostTitle;
      chatEmptyState = config.chatEmptyState;
      chatTyping = config.chatTypingIndicator;
    } else {
      // Find all DOM elements
      chatContainer = document.getElementById("chat-container");
      chatHeader = document.getElementById("chat-header");
      chatMessages = document.getElementById("chat-messages");
      chatInput = document.getElementById("chat-input");
      chatSendBtn = document.getElementById("chat-send-btn");
      chatCloseBtn = document.getElementById("chat-close-btn");
      chatMinimizeBtn = document.getElementById("chat-minimize-btn");
      chatEmptyState = document.getElementById("chat-empty-state");
      chatTyping = document.getElementById("chat-typing");
      chatRecipientName = document.getElementById("chat-recipient-name");
      chatPostTitle = document.getElementById("chat-post-title");
      chatAvatar = document.getElementById("chat-avatar")?.querySelector("img");
      typingName = document.querySelector(".typing-name");
    }

    // Find all in-app chat buttons
    chatButtons = document.querySelectorAll(
      '.contact-method-btn[data-method="in-app"]'
    );

    // If chat isn't available or not on a post detail page, return early
    if (!chatContainer) {
      console.log("Chat container not found, skipping chat initialization");
      return;
    }

    // Set up event listeners for chat components
    setupEventListeners();

    // Check authentication status
    checkAuthentication();
  }

  /**
   * Set up event listeners for chat components
   */
  function setupEventListeners() {
    // Add click event to all in-app chat buttons
    if (chatButtons && chatButtons.length) {
      chatButtons.forEach((button) => {
        button.addEventListener("click", async (e) => {
          const postId = button.getAttribute("data-post-id");
          const sellerId = button.getAttribute("data-seller-id");

          // If not logged in, handle redirection to login
          if (!isAuthenticated) {
            checkAuthentication();
            return;
          }

          // Open chat with this seller for this post
          openChat(postId, sellerId);
        });
      });
    }

    // Chat input event listeners
    if (chatInput) {
      chatInput.addEventListener("input", () => {
        // Enable/disable send button based on input
        chatSendBtn.disabled = chatInput.value.trim().length === 0;

        // Emit typing event if input has text
        if (chatInput.value.trim().length > 0) {
          emitTyping();
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

    if (chatMinimizeBtn) {
      chatMinimizeBtn.addEventListener("click", () => {
        minimizeChat();
      });
    }

    // Allow dragging the chat window by its header
    if (chatContainer && chatHeader) {
      makeDraggable(chatContainer, chatHeader);
    }

    // Listen for chat open events from other parts of the application
    document.addEventListener("openChat", (event) => {
      const { postId, recipientId, recipient, avatar, postTitle } =
        event.detail;
      openChat(postId, recipientId, recipient, avatar, postTitle);
    });
  }

  /**
   * Check if user is authenticated and redirect to login if not
   */
  async function checkAuthentication() {
    try {
      const response = await fetch("/api/auth/check", {
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
        initializeSocketConnection();
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
   */
  function initializeSocketConnection() {
    if (!isAuthenticated) {
      return;
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
      return;
    }

    try {
      // Initialize socket connection with proper options
      socket = io({
        auth: {
          token: document.cookie.replace(
            /(?:(?:^|.*;\s*)login\s*\=\s*([^;]*).*$)|^.*$/,
            "$1"
          ),
        },
        transports: ["websocket", "polling"], // Try WebSocket first, then fall back to polling
        reconnectionAttempts: 5, // Limit reconnection attempts
        reconnectionDelay: 1000, // Start with 1 second delay
        reconnectionDelayMax: 5000, // Maximum delay of 5 seconds
        timeout: 20000, // Longer timeout for initial connection
        forceNew: false, // Reuse existing connection if available
        autoConnect: true, // Automatically connect
      });

      // Socket event listeners
      socket.on("connect", () => {
        console.log("Connected to chat server");
        // Clear any previous error notifications
        const errorNotification = document.querySelector(".notification.error");
        if (errorNotification) {
          errorNotification.remove();
        }
      });

      socket.on("connect_error", (error) => {
        console.error("Connection error:", error);
        console.error("Connection details:", {
          id: socket.id,
          connected: socket.connected,
          disconnected: socket.disconnected,
        });
        showNotification(
          "Failed to connect to chat server. Please refresh the page to try again.",
          "error"
        );
      });

      socket.on("reconnect_attempt", (attemptNumber) => {
        console.log(`Attempting to reconnect: attempt ${attemptNumber}`);
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

      socket.on("new-message", (message) => {
        console.log("Received new message:", message);
        addMessageToChat(message);
        markMessagesAsRead();
      });

      socket.on("message-sent", (data) => {
        console.log("Message sent confirmation received:", data);
        // Add your own message to the chat UI
        const sentMessage = {
          _id: data.messageId || `temp-${Date.now()}`,
          content: chatInput.value.trim(),
          createdAt: new Date(),
          isCurrentUser: true,
        };
        addMessageToChat(sentMessage);
      });

      socket.on("user-typing", ({ userId }) => {
        if (userId === currentRecipientId) {
          showTypingIndicator();
        }
      });

      socket.on("messages-read", () => {
        // Update UI to show messages as read if needed
      });

      socket.on("error", (error) => {
        console.error("Socket error:", error);
        showNotification(error.message || "An error occurred", "error");
      });
    } catch (error) {
      console.error("Error initializing Socket.IO connection:", error);
      showNotification(
        "Chat service is currently unavailable. Please try again later.",
        "error"
      );
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

    // If socket not connected, try to initialize it
    if (!socket || !socket.connected) {
      console.log("Socket not connected, initializing connection...");
      initializeSocketConnection();

      // Wait a bit for socket to connect
      await new Promise((resolve) => setTimeout(resolve, 500));

      // If still not connected, show error
      if (!socket || !socket.connected) {
        showNotification(
          "Could not connect to chat server. Please try again later.",
          "error"
        );
        return;
      }
    }

    console.log("Opening chat:", { postId, recipientId, recipientName });
    currentPostId = postId;
    currentRecipientId = recipientId;

    // Clear previous messages
    clearChat();

    // Join the chat room for this conversation
    socket.emit("join-chat", { postId, userId: recipientId });

    // If recipient details are provided, use them directly
    if (recipientName && (avatar || postTitle)) {
      const userData = {
        name: recipientName,
        avatar: avatar || "",
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

    // Focus the input field
    setTimeout(() => {
      chatInput.focus();
    }, 300);
  }

  /**
   * Load chat history from the server
   * @param {string} postId - The ID of the post
   * @param {string} userId - The ID of the other user
   */
  async function loadChatHistory(postId, userId) {
    try {
      console.log(
        `Loading chat history for postId=${postId}, userId=${userId}`
      );
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
        console.log("Unauthorized access, redirecting to login");
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

      // Validate essential data and use fallbacks if missing
      if (!data.messages) data.messages = [];
      if (!data.otherUser) {
        data.otherUser = {
          name: "Unknown User",
          avatar: "/img/default-avatar.svg",
        };
      }
      if (!data.post) {
        data.post = {
          title: "Unknown Post",
        };
      }

      // Update UI with user info
      updateChatHeader(data.otherUser, data.post);

      // Add messages to the chat
      if (data.messages && data.messages.length > 0) {
        hideEmptyState();
        data.messages.forEach((message) => {
          addMessageToChat(message);
        });

        // Mark messages as read
        markMessagesAsRead();

        // Scroll to the bottom
        scrollToBottom();
      } else {
        console.log("No messages found in conversation");
        showEmptyState();
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      // Try to recover - show empty chat rather than broken UI
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
      console.error("User data is undefined in updateChatHeader");
      user = { name: "Unknown User", avatar: "/img/default-avatar.svg" };
    }

    if (!post) {
      console.error("Post data is undefined in updateChatHeader");
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
    hideEmptyState();

    const messageElement = document.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.classList.add(
      message.isCurrentUser ? "outgoing" : "incoming"
    );

    // Format the date
    const messageDate = new Date(message.createdAt);
    const formattedTime = messageDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    messageElement.innerHTML = `
      <div class="chat-message-content">${escapeHtml(message.content)}</div>
      <div class="chat-message-time">${formattedTime}</div>
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
      console.warn(
        "Cannot send message: ",
        !message ? "Empty message" : "Socket not connected"
      );
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
      // Send message via socket
      socket.emit("send-message", {
        postId: currentPostId,
        recipientId: currentRecipientId,
        content: message,
      });

      // Clear the input
      chatInput.value = "";
    } catch (error) {
      console.error("Error sending message:", error);
      showNotification("Failed to send message. Please try again.", "error");
    } finally {
      // Re-enable input and button
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
   * Show the typing indicator
   */
  function showTypingIndicator() {
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
    chatMessages.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <p class="chat-empty-text">Loading messages...</p>
      </div>
    `;
  }

  /**
   * Show empty state in the chat
   */
  function showEmptyState() {
    chatEmptyState.style.display = "flex";
  }

  /**
   * Hide empty state in the chat
   */
  function hideEmptyState() {
    chatEmptyState.style.display = "none";
  }

  /**
   * Clear all messages from the chat
   */
  function clearChat() {
    chatMessages.innerHTML = "";
    chatEmptyState.style.display = "flex";
  }

  /**
   * Close the chat window
   */
  function closeChat() {
    chatContainer.classList.remove("open");
    clearChat();
    currentPostId = "";
    currentRecipientId = "";
  }

  /**
   * Minimize the chat window
   */
  function minimizeChat() {
    chatContainer.classList.remove("open");
  }

  /**
   * Scroll the chat window to the bottom
   */
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /**
   * Display a notification to the user
   * @param {string} message - The message to display
   * @param {string} type - The type of notification (info, success, error)
   */
  function showNotification(message, type = "info") {
    // Check if the showNotification function exists globally (defined in post-detail.js)
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

  // Public API
  return {
    initialize: initialize,
    openChat: openChat,
  };
})();

// Make Chat available globally for other scripts that may need it
window.Chat = Chat;

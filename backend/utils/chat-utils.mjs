import Message from "../mongoose/message.mjs";
import Post from "../mongoose/post.mjs";

/**
 * Function to handle creating a new conversation or adding a message to an existing one
 * @param {Object} options - Options object
 * @param {string} options.userId - Current user ID
 * @param {string} options.otherUserId - Other user ID
 * @param {string} options.postId - Post ID
 * @param {string} options.content - Message content
 * @returns {Promise<Object>} - Created or updated conversation
 */
export async function createOrUpdateConversation({
  userId,
  otherUserId,
  postId,
  content,
}) {
  try {
    // Get post to ensure it exists and retrieve post creator
    const post = await Post.findById(postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Create message object
    const newMessage = {
      content,
      sentBy: userId,
      createdAt: new Date(),
      read: false,
    };

    // Find existing conversation or create new one
    let conversation = await Message.findOne({
      postId,
      "users.user": { $all: [userId, otherUserId] },
    });

    if (conversation) {
      // Add message to existing conversation
      conversation.messages.push(newMessage);
      await conversation.save();
    } else {
      // Create new conversation
      conversation = new Message({
        users: [{ user: userId }, { user: otherUserId }],
        postId,
        messages: [newMessage],
      });
      await conversation.save();
    }

    return conversation;
  } catch (error) {
    console.error("Error in createOrUpdateConversation:", error);
    throw error;
  }
}

/**
 * Get unread message count for a user
 * @param {string} userId - User ID to get unread count for
 * @returns {Promise<number>} - Number of unread messages
 */
export async function getUnreadMessageCount(userId) {
  try {
    //Find conversations where user is involved (conversations = a message document)
    const conversations = await Message.find({
      "users.user": userId,
    });

    //Count unread messages across all conversations
    let totalUnread = 0;

    for (const conversation of conversations) {
      const unreadCount = conversation.messages.filter(
        (msg) => !msg.read && msg.sentBy.toString() !== userId.toString()
      ).length;
      totalUnread += unreadCount;
    }

    return totalUnread;
  } catch (error) {
    console.error("Error getting unread count:", error);
    throw error;
  }
}

/**
 * Mark messages as read in a conversation
 * @param {Object} options - Options object
 * @param {string} options.currentUserId - Current user ID
 * @param {string} options.senderId - Sender user ID
 * @param {string} options.postId - Post ID
 * @returns {Promise<boolean>} - Whether any messages were updated
 */
export async function markMessagesAsRead({ currentUserId, senderId, postId }) {
  try {
    // Find the conversation
    const conversation = await Message.findOne({
      postId,
      "users.user": { $all: [currentUserId, senderId] },
    });

    if (!conversation) {
      return false;
    }

    // Update all unread messages from the sender to read
    let updated = false;
    conversation.messages.forEach((msg) => {
      if (!msg.read && msg.sentBy.toString() === senderId.toString()) {
        msg.read = true;
        updated = true;
      }
    });

    if (updated) {
      await conversation.save();
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error marking messages as read:", error);
    throw error;
  }
}

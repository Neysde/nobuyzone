import Message from "../mongoose/message.mjs";
import Post from "../mongoose/post.mjs";
import mongoose from "mongoose";
import User from "../mongoose/user.mjs";

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

    // --- FIX START: Update the lastMessage field ---
    conversation.lastMessage = {
      text: content,
      timestamp: newMessage.createdAt,
      sender: userId,
      read: false,
    };
    // --- FIX END ---

    await conversation.save();

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

/**
 * Fetches and formats the chat list for a given user.
 * @param {string} userId - The ID of the user to fetch chats for.
 * @returns {Promise<Array>} A promise that resolves to an array of formatted chat objects.
 */
export async function getChatsForUser(userId) {
  if (!userId) {
    return [];
  }

  const objectId = new mongoose.Types.ObjectId(userId);

  // Find all conversations the user is a part of
  const conversations = await Message.find({ "users.user": objectId })
    .populate({
      path: "users.user",
      model: "User",
      select: "username firstName lastName profilePicture showUsername",
    })
    .populate({
      path: "postId",
      model: "Post",
      select: "title",
    })
    .sort({ "messages.createdAt": -1 }); // Sort by the most recent message activity

  const chats = conversations.map((convo) => {
    // Find the other user in the conversation
    const otherUser = convo.users.find(
      (u) => u.user._id.toString() !== userId.toString()
    )?.user;

    // If data is inconsistent, skip this chat to prevent errors
    if (!otherUser || !convo.postId) {
      return null;
    }

    // Calculate unread messages for this specific chat
    const unreadCount = convo.messages.filter(
      (msg) => !msg.read && msg.sentBy.toString() !== userId.toString()
    ).length;

    // Get the last message from the array for display
    const lastMessage =
      convo.messages.length > 0
        ? convo.messages[convo.messages.length - 1]
        : null;

    // The template expects 'avatar', but the User model provides 'profilePicture'. We alias it here.
    const userForTemplate = {
      _id: otherUser._id,
      showUsername: otherUser.showUsername,
      username: otherUser.username,
      firstName: otherUser.firstName,
      lastName: otherUser.lastName,
      avatar: otherUser.profilePicture
        ? otherUser.profilePicture.url
        : "/img/default-profile.png", // Use fallback
    };

    return {
      user: userForTemplate, // The template expects `chat.user`, so we provide it.
      postId: convo.postId._id.toString(),
      postTitle: convo.postId.title,
      unreadCount,
      lastMessage: lastMessage
        ? {
            text: lastMessage.content,
            timestamp: lastMessage.createdAt,
            isMine: lastMessage.sentBy.toString() === userId.toString(),
          }
        : null,
    };
  });

  // Filter out any null entries that resulted from inconsistent data
  return chats.filter((chat) => chat !== null);
}

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    users: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      },
    ],
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    messages: [
      {
        content: {
          type: String,
          required: true,
          trim: true,
        },
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        read: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Add index for efficient querying
messageSchema.index({ postId: 1, "users.user": 1 });
messageSchema.index({ "users.user": 1 });
messageSchema.index({ "messages.read": 1 });

// Custom validation to ensure only 2 unique users
messageSchema.pre("save", function (next) {
  // Convert users array to a set of unique IDs
  const uniqueUsers = new Set(this.users.map((u) => u.user.toString()));

  // Check if there are exactly 2 unique users
  if (uniqueUsers.size !== 2) {
    return next(new Error("Messages must have exactly 2 unique users"));
  }

  next();
});

const Message = mongoose.model("Message", messageSchema);

export default Message;

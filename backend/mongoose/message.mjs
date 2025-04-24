import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
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
messageSchema.index({ sender: 1, recipient: 1, postId: 1 });
messageSchema.index({ recipient: 1, read: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;

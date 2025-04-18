import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Add compound index to ensure a user can only favorite a post once
favoriteSchema.index({ userId: 1, postId: 1 }, { unique: true });

export default mongoose.model("Favorite", favoriteSchema, "favorites");

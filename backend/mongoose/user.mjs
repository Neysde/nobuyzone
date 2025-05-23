import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
  },
  firstName: {
    type: String,
    required: [true, "Name is required"],
  },
  lastName: {
    type: String,
    required: [true, "Surname is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  profilePicture: {
    url: {
      type: String,
    },
    publicId: {
      type: String,
    },
  },
  verified: {
    type: Boolean,
    default: false,
  },
  showUsername: {
    type: Boolean,
    default: false,
  },
  termsAccepted: {
    type: Boolean,
    required: true,
  },
  //Store user's favorite posts
  favorites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
  //Store posts that user has flagged
  flaggedPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
});

export default mongoose.model("User", userSchema, "users");

import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    // Basic item details
    title: {
      type: String,
      required: [true, "Title is required"],
      maxlength: 140,
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["furniture", "electronics", "clothing", "books", "other"],
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
      enum: ["new", "like-new", "good", "fair"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    // Location information
    location: {
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
      district: {
        type: String,
        required: [true, "District is required"],
        trim: true,
      },
      neighborhood: {
        type: String,
        required: [true, "Neighborhood is required"],
        trim: true,
      },
      street: {
        type: String,
        required: [true, "Street is required"],
        trim: true,
      },
      coordinates: {
        latitude: {
          type: Number,
        },
        longitude: {
          type: Number,
        },
      },
    },

    // Images (after upload to Cloudinary)
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },
      },
    ],

    // Contact preferences
    contactPreference: {
      type: String,
      enum: ["in-app", "email", "phone"],
      default: "in-app",
    },

    // Status information
    status: {
      type: String,
      enum: ["active", "draft", "completed", "deleted"],
      default: "active",
    },

    // References and timestamps
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Add index for better query performance
postSchema.index({ "location.city": 1, category: 1, status: 1 });
postSchema.index({ createdAt: -1 }); // For recent listings
postSchema.index({
  "location.coordinates.latitude": 1,
  "location.coordinates.longitude": 1,
}); // For geospatial queries

export default mongoose.model("Post", postSchema, "posts");

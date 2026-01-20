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
      enum: ["elektronik", "ev-dekorasyonu", "evcil-hayvan-urunleri", "gida", "giyim", "hediyelik-esya", "kitap-kirtasiye", "kozmetik-kisisel-bakim", "mobilya", "oto-aksesuar-yedek-parca", "saglik-medikal", "spor-outdoor", "teknoloji", "diger"],
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

    // Contact preferences - updated to support multiple preferences
    contactPreferences: {
      type: [String],
      enum: ["in-app", "email", "phone"],
      default: ["in-app"],
      validate: {
        validator: function (preferences) {
          // Ensure at least one preference is selected
          return preferences && preferences.length > 0;
        },
        message: "At least one contact preference is required",
      },
    },

    // Contact details
    contactDetails: {
      email: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },

    // Status information
    status: {
      type: String,
      enum: ["active", "draft", "deleted", "closed"],
      default: "active",
    },
    closedAt: {
      type: Date,
    },

    //post approve info 
    approved: {
      type: Boolean,
      default: false,
    },

    // Flag count for reporting inappropriate posts
    flagCount: {
      type: Number,
      default: 0,
    },

    // User agreement approval status - tracks if user accepted terms before creating/saving post
    approveUserAgreementBeforeCreation: {
      type: Boolean,
      default: false,
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

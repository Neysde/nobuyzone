import mongoose from "mongoose"

const postingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        maxLength: 140
    },

    category: {
        type: String, //need to create a product type listing (json) and select from there.
        required: true,
        default: "General",
    },

    details: {
        description: {
            type: String,
            required: true,
        },
        location: {
            city: {
                type: String,
                required: true,
            },
            district: {
                type: String,
                required: true,
            },
            street: {
                type: String,
                required: true,
            }

        },
        coordinates: { 
            latitude: {
                type: Number,
            },
            longitude: {
                type: Number,
            } //gps location a circle not exact. check geocoder service 
        },
        media: {
            images: [
                {
                    url: String,
                    publicId: String,
                }
            ],
        },

        contact: {
            type: String,
      enum: ['email', 'phone', 'in-app'], //email will be encrypted
      default: 'in-app'
        }
    },

    flags: {
        count: Number,
        reasons: [String]
      },

      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastModified: {
        type: Date,
        default: Date.now,
      },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },

})

export const Post = mongoose.model("Post", postingSchema, "post");
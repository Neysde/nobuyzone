import mongoose from "mongoose";
import { type } from "os";

const coordinatesSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: [true, "Latitude is required"],
  },

  longitude: {
    type: Number,
    required: [true, "Longitude is required"],
  },
  address: {
    country: {
      type: String,
      required: [true, "Country is required"],
      default: "Turkey",
    },
    province: {
      //city

      type: String,
      required: [true, "Province is required"],
      default: "Istanbul",
    },
    town: {
      //district
      type: String,
      required: [true, "Town is required"],
    },
    suburb: {
      //neighborhood
      type: String,
      required: [true, "Suburb is required"],
    },
    road: {
      //street
      type: String,
      required: [true, "District is required"],
    },
  },
});

export const Coordinates = mongoose.model(
  "Coordinates",
  coordinatesSchema,
  "coordinates"
);

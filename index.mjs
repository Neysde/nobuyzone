import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import { Coordinates } from "./coordinates.js";

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "views")));

const connectionString =
  "mongodb+srv://root:1Ow6PKsLv1It8K2S@cluster0.ok6h4.mongodb.net/bartertest?retryWrites=true&w=majority&appName=Cluster0";
mongoose
  .connect(connectionString) // just change localhost to 0.0.0.0 to prevent error. (MongoDB seems to be not compatible with NodeJS v17)
  .then(() => console.log("Connected to the database."))
  .catch((err) => console.log(`Error: ${err}`));

app.set("views", path.join(__dirname, "./views"));
app.set("view engine", "ejs");

const apiKey = "67f036a6524c4571002304nfp4826b8"; //will be moved to .env

async function forwardGeocode(address) {
  const url = `https://geocode.maps.co/search?q=${address}&api_key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in reverseGeocode:", error);
    return { error: { message: "Failed to fetch geocode data" } };
  }
}

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/testpage", (req, res) => {
  res.render("page.ejs");
});

// New endpoint to get location data for product page
// This endpoint fetches location data from the database and returns it with privacy protection
app.get("/api/listinglocation/:id?", async (req, res) => {
  try {
    const listingId = req.params.id || "default";

    //in production we will fetch the coordinates based on the id (will change -1 to listingId)
    const locationData = await Coordinates.findOne().sort({ _id: -1 }); //-1 most recently created documents will appear first

    if (!locationData) {
      return res
        .status(404)
        .json({ error: { message: "No location data found" } });
    }

    const lat = parseFloat(locationData.latitude);
    const lon = parseFloat(locationData.longitude);

    // Add random offset to hide exact location (0.01 ≈ 1km) now -300 +300m
    const offset = 0.003;
    const centerLat = lat + (Math.random() * offset * 2 - offset);
    const centerLon = lon + (Math.random() * offset * 2 - offset);

    res.json({
      location: {
        centerLat,
        centerLon,
        displayName: `${locationData.address.suburb}, ${locationData.address.road}, ${locationData.address.town}, ${locationData.address.province}`,
        radiusMeters: 200, // Circle radius for the map display
      },
    });
  } catch (error) {
    console.error("Error fetching location data:", error);
    res
      .status(500)
      .json({ error: { message: "Failed to fetch location data" } });
  }
});

app.post("/api/forwardgeocode", async (req, res) => {
  const {
    body: { address },
  } = req;
  const data = await forwardGeocode(address);
  res.json(data);
});

app.post("/api/reversegeocode", async (req, res) => {
  try {
    const {
      body: { lat, lon },
    } = req;

    if (!lat || !lon) {
      return res
        .status(400)
        .json({ error: { message: "Missing latitude or longitude" } });
    }

    // Get the geocode data
    const data = await reverseGeocode(lat, lon);

    // Create and save coordinates
    const newCoordinates = new Coordinates({
      latitude: lat,
      longitude: lon,
      address: {
        country: data.address.country,
        province: data.address.province,
        town: data.address.town || "Unknown",
        suburb: data.address.suburb || "Unknown",
        road: data.address.road || "Unknown",
      },
    });

    await newCoordinates.save();

    // Return the geocode data
    res.json(data);
  } catch (error) {
    console.error("Error in /api/reversegeocode:", error);
    res.status(500).json({ error: { message: "Server error" } });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

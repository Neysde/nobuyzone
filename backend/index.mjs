import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import expressLayouts from "express-ejs-layouts";

//we need to create our own __dirname because we are using mjs files. In js files we have __dirname as a global variable.
const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

// Set up views directory and serve static files from it
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../views")));

const connectionString =
  "mongodb+srv://root:1Ow6PKsLv1It8K2S@cluster0.ok6h4.mongodb.net/bartertest?retryWrites=true&w=majority&appName=Cluster0";
mongoose
  .connect(connectionString) // just change localhost to 0.0.0.0 to prevent error. (MongoDB seems to be not compatible with NodeJS v17)
  .then(() => console.log("Connected to the database."))
  .catch((err) => console.log(`Error: ${err}`));

app.set("view engine", "ejs");

app.use(expressLayouts);
app.use("/css", express.static(path.join(__dirname, "../views/css")));
app.use("/js", express.static(path.join(__dirname, "../views/js")));

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

app.get("/posting", (req, res) => {
    res.render("posting.ejs");
  });

  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
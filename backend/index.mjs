import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Create __dirname for ES modules (needed for path.resolve in dotenv.config)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file. This MUST be at the top, after essential imports for path resolution.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Now proceed with all other application imports
import express from "express";
import mongoose from "mongoose";
import expressLayouts from "express-ejs-layouts";
import routes from "./routes/routes.mjs";
import chatRoutes from "./routes/chat-routes.mjs";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-jwt";
import User from "./mongoose/user.mjs";
import Post from "./mongoose/post.mjs";
import { isAuthenticated } from "./middlewares.mjs";
import { createServer } from "http";
import { initializeSocketServer } from "./socket-server.mjs";

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO through our separate module
const io = initializeSocketServer(httpServer);

app.use(express.json());
app.use(cookieParser());

//Session middleware setup for admins
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, //set to true in prod
      httpOnly: true,
      maxAge: parseInt(process.env.COOKIE_MAX_AGE),
    },
  })
);

const jwtOptions = {
  jwtFromRequest: (req) => {
    var token = null;
    if (req && req.cookies) {
      token = req.cookies["login"]; // Cookie name used in login function
    }
    return token;
  },
  secretOrKey: process.env.SECRETKEY,
};

passport.use(
  new Strategy(jwtOptions, async (jwt_payload, done) => {
    try {
      // Find user by _id using async/await
      const user = await User.findOne({ _id: jwt_payload._id });
      if (user) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    } catch (err) {
      return done(err, false);
    }
  })
);

// Initialize passport
app.use(passport.initialize());

// Middleware to check authentication without redirecting
app.use((req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    // Attach user to request object if authenticated
    req.user = user || null;
    next();
  })(req, res, next);
});

// Set up views directory and serve static files from it
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../views")));
app.use(express.static(path.join(__dirname, "../public")));

// Set up static file directories
app.use(expressLayouts);
app.use("/css", express.static(path.join(__dirname, "../views/css")));
app.use("/js", express.static(path.join(__dirname, "../views/js")));
app.use("/backend/json", express.static(path.join(__dirname, "json")));

// Use the MongoDB URI from environment variables
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to the database."))
  .catch((err) => console.log(`Error: ${err}`));

app.set("view engine", "ejs");

// Homepage redirect to find-posts
app.get("/", (req, res) => {
  res.redirect("/find-posts");
});

app.use(routes); // all routes

app.get("/posting", isAuthenticated, async (req, res) => {
  try {
    // Check if a draft ID was provided
    const draftId = req.query.draft;

    // Render the posting page as is if no draft ID was provided
    if (!draftId) {
      return res.render("posting.ejs", { user: req.user });
    }

    // Fetch the draft post if an ID was provided
    const draft = await Post.findOne({
      _id: draftId,
      createdBy: req.user._id,
      status: "draft",
    });

    // If no draft found or not owned by current user, render empty form
    if (!draft) {
      return res.render("posting.ejs", { user: req.user });
    }

    // Pass the draft data to the template
    try {
      // Convert the Mongoose document to a plain JavaScript object
      const draftObject = draft.toObject();

      // Stringify the draft data for the template
      const draftJson = JSON.stringify(draftObject);

      res.render("posting.ejs", { draft: draftJson, user: req.user });
    } catch (serializationError) {
      console.error("Error serializing draft data:", serializationError);
      // Fallback to plain rendering if there's an issue with serialization
      res.render("posting.ejs", { user: req.user });
    }
  } catch (error) {
    console.error("Error rendering posting page:", error);
    res.render("posting.ejs", { user: req.user });
  }
});

// Start the server with httpServer instead of app, using PORT from env
const PORT = parseInt(process.env.PORT);
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(
    `Socket.IO server is available at http://localhost:${PORT}/socket.io/socket.io.js`
  );
});

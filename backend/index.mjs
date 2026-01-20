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
import { initializeCronJobs } from "./cron-jobs.mjs";

const app = express();
const httpServer = createServer(app);

// Initialize Cron Jobs
initializeCronJobs();

// Initialize Socket.IO through our separate module
const io = initializeSocketServer(httpServer);

// Security Middleware Imports
import helmet from "helmet";
// import mongoSanitize from "express-mongo-sanitize"; // Replaced with custom middleware
import rateLimit from "express-rate-limit";
import { mongoSanitize } from "./middlewares.mjs";

// Set security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabling CSP for now to avoid breaking existing scripts/images. Can be hardened later.
  })
);

// Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Limit each IP to 1000 requests per windowMs (general API limit)
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use(limiter);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); // Ensure urlencoded is enabled if not already

// Data Sanitization against NoSQL query injection
// Must be AFTER body parsers
app.use(mongoSanitize);

//Session middleware setup for admins
import MongoStore from "connect-mongo";

// Session middleware setup for admins
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Changed to false for MongoStore
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
    }),
    cookie: {
      secure: process.env.SECURE_COOKIES === "true", // Configurable via .env
      httpOnly: true,
      sameSite: 'Lax', // Protects against CSRF
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

// Homepage now renders the main page with the map
app.get("/", (req, res) => {
  res.render("main", { user: req.user, title: "NoBuyZone" });
});

app.use(routes); // all routes

// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));


app.get("/posting", isAuthenticated, async (req, res) => {
  try {
    // Check if a draft ID was provided
    const draftId = req.query.draft;

    // Render the posting page as is if no draft ID was provided
    if (!draftId) {
      return res.render("posting.ejs", { user: req.user, title: "İlan Oluştur | NoBuyZone" });
    }

    // Fetch the draft post if an ID was provided
    const draft = await Post.findOne({
      _id: draftId,
      createdBy: req.user._id,
      status: "draft",
    });

    // If no draft found or not owned by current user, render empty form
    if (!draft) {
      return res.render("posting.ejs", { user: req.user, title: "İlan Oluştur | NoBuyZone" });
    }

    // Pass the draft data to the template
    try {
      // Convert the Mongoose document to a plain JavaScript object
      const draftObject = draft.toObject();

      // Stringify the draft data for the template and escape potentially dangerous keys
      const draftJson = JSON.stringify(draftObject).replace(/</g, "\\u003c");

      res.render("posting.ejs", { draft: draftJson, user: req.user, title: "İlan Oluştur | NoBuyZone" });
    } catch (serializationError) {
      console.error("Error serializing draft data:", serializationError);
      // Fallback to plain rendering if there's an issue with serialization
      res.render("posting.ejs", { user: req.user, title: "İlan Oluştur | NoBuyZone" });
    }
  } catch (error) {
    console.error("Error rendering posting page:", error);
    res.render("posting.ejs", { user: req.user, title: "İlan Oluştur | NoBuyZone" });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Sunucu hatası",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 Handler - !!!!!! This must be the last middleware to catch all unhandled routes
app.use((req, res, next) => {
  res.status(404).render("404", {
    layout: false,
  });
});

// Start the server with httpServer instead of app, using PORT from env
const PORT = parseInt(process.env.PORT);
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(
    `Socket.IO server is available at ${process.env.BASE_URL}:${PORT}/socket.io/socket.io.js`
  );
});

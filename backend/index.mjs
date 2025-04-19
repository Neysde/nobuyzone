import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import expressLayouts from "express-ejs-layouts";
import routes from "./routes/routes.mjs";
import cookieParser from "cookie-parser";
import passport from "passport";
import { Strategy } from "passport-jwt";
import User from "./mongoose/user.mjs";
import Post from "./mongoose/post.mjs";
import { isAuthenticated } from "./middlewares.mjs";

//we need to create our own __dirname because we are using mjs files. In js files we have __dirname as a global variable.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(cookieParser());

const jwtOptions = {
  jwtFromRequest: (req) => {
    var token = null;
    if (req && req.cookies) {
      token = req.cookies["login"]; // This matches the cookie name in login function
    }
    return token;
  },
  secretOrKey: "process.env.SECRETKEY", //will be moved to .env
};

passport.use(
  new Strategy(jwtOptions, async (jwt_payload, done) => {
    try {
      // Find user by _id (not 'id') and use async/await since mongoose no longer supports callbacks
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

//!!!!!Initialize passport
app.use(passport.initialize());

// Middleware to check authentication status without redirecting
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

// Set up static file directories
app.use(expressLayouts);
app.use("/css", express.static(path.join(__dirname, "../views/css")));
app.use("/js", express.static(path.join(__dirname, "../views/js")));
app.use("/backend/json", express.static(path.join(__dirname, "json")));

const connectionString =
  "mongodb+srv://root:1Ow6PKsLv1It8K2S@cluster0.ok6h4.mongodb.net/bartertest?retryWrites=true&w=majority&appName=Cluster0";
mongoose
  .connect(connectionString) // just change localhost to 0.0.0.0 to prevent error. (MongoDB seems to be not compatible with NodeJS v17)
  .then(() => console.log("Connected to the database."))
  .catch((err) => console.log(`Error: ${err}`));

app.set("view engine", "ejs");

// Homepage redirect to find-posts
app.get("/", (req, res) => {
  res.redirect("/find-posts");
});

app.use(routes);

app.get("/posting", isAuthenticated, async (req, res) => {
  try {
    // Check if a draft ID was provided
    const draftId = req.query.draft;

    console.log("Draft ID:", draftId);

    // Render the posting page as is if no draft ID was provided
    if (!draftId) {
      return res.render("posting.ejs", { user: req.user });
    }

    // Fetch the draft post if an ID was provided - use Post instead of mongoose.model("Post")
    const draft = await Post.findOne({
      _id: draftId,
      createdBy: req.user._id,
      status: "draft",
    });

    console.log("Found draft:", draft ? "yes" : "no");
    if (draft) {
      console.log("Draft title:", draft.title);
      console.log("User ID:", req.user._id);
      console.log(
        "Matching user:",
        draft.createdBy.toString() === req.user._id.toString()
      );
    }

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
      console.log("Draft JSON length:", draftJson.length);

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

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

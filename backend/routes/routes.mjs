import express from "express";
import {
  uploadImage,
  deleteImage,
  multerUploads,
  singleImageUpload,
} from "./image-upload.mjs";
import postRouter from "./post-routes.mjs";
import uiRouter from "./ui-routes.mjs";
import userRouter from "./user-routes.mjs";

import chatRouter from "./chat-routes.mjs";
import devRoutes from "./devRoutes.mjs";
import adminRoutes from "./adminRoutes.mjs";
import path from "path";

const router = express.Router();

//Add body parsing middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

//Upload image route
router.post("/api/upload", multerUploads, uploadImage);

//Specific route for post image uploads - simpler configuration
router.post("/api/posts/upload-image", singleImageUpload, uploadImage);

//Delete image route
router.delete("/api/delete/:public_id", deleteImage);

// Redirect /chat to /messages for consistency
router.get("/chat", (req, res) => {
  res.redirect("/messages");
});

// Redirect /chats to /messages for consistency
router.get("/chats", (req, res) => {
  res.redirect("/messages");
});

// Add endpoint to serve environment variables to the frontend
router.get("/api/config", (req, res) => {
  // Only expose variables that are needed on the frontend
  res.json({
    GEOCODING_API_KEY: process.env.GEOCODING_API_KEY,
    MIN_REQUEST_INTERVAL: parseInt(process.env.MIN_REQUEST_INTERVAL),
    BASE_URL: process.env.BASE_URL,
  });
});

router.use(postRouter);
router.use(uiRouter);
router.use(userRouter);
router.use(chatRouter);
router.use("/dev", devRoutes); // Use dev routes, perhaps prefixed with /dev
router.use("/admin", adminRoutes); // Use admin routes, prefixed with /admin

export default router;

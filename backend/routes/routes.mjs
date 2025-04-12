import express from "express";
import {
  uploadImage,
  deleteImage,
  multerUploads,
  singleImageUpload,
} from "./image-upload.mjs";
import postsRouter from "./posts.mjs";
import uiRouter from "./ui-routes.mjs";

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

router.use(postsRouter);
router.use(uiRouter);

export default router;

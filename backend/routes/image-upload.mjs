import { config, uploader, v2 as cloudinary } from "cloudinary";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { fileTypeFromBuffer } from "file-type";

// Configure Cloudinary with credentials
config({
  cloud_name: "dcz6aghbq",
  api_key: "724354672218175",
  api_secret: "ft59ETqxJGCKSFpwvngE1UhwSLc",
});

//cloudiary middleware (keeping for backwards compatibility)
const cloudinaryConfig = (req, res, next) => {
  config({
    cloud_name: "dcz6aghbq",
    api_key: "724354672218175",
    api_secret: "ft59ETqxJGCKSFpwvngE1UhwSLc",
  });
  next();
};

export { cloudinaryConfig, uploader, cloudinary };

const storage = multer.memoryStorage();

// Updated to handle multiple files with different field names
const multerUploads = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "infoImage", maxCount: 1 },
  { name: "contentImages[]", maxCount: 10 }, // Updated field name with array notation
  { name: "contentImages", maxCount: 10 }, // Also include without array notation for compatibility
  { name: "tweetImage", maxCount: 1 }, // Add tweetImage field for the tweet form
]);

// Single image upload specifically for post images
const singleImageUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
}).single("image");

const createDataURI = async (buffer) => {
  const type = await fileTypeFromBuffer(buffer);
  if (!type?.mime.startsWith("image/")) {
    throw new Error("Invalid file type");
  }
  return `data:${type.mime};base64,${buffer.toString("base64")}`;
};

// Updated to handle both single file and file object
const dataUri = async (fileOrReq) => {
  try {
    // If it's a request object with a file property
    if (fileOrReq.file?.buffer) {
      return createDataURI(fileOrReq.file.buffer);
    }

    // If it's a file object directly (from req.files[fieldname][index])
    if (fileOrReq.buffer) {
      return createDataURI(fileOrReq.buffer);
    }

    // If it's a req with files property
    if (fileOrReq.files && Object.keys(fileOrReq.files).length > 0) {
      const fieldName = Object.keys(fileOrReq.files)[0];
      if (fileOrReq.files[fieldName][0]?.buffer) {
        return createDataURI(fileOrReq.files[fieldName][0].buffer);
      }
    }

    throw new Error("No file buffer found");
  } catch (error) {
    console.error("Error in dataUri:", error);
    throw new Error("Failed to process image data");
  }
};

export { multerUploads, dataUri, singleImageUpload };

// Error handling middleware
const handleError = (res, error, status = 500) => {
  console.error("Image upload error:", error);
  res.status(status).json({
    success: false,
    error: error.message || "An error occurred while processing the image",
  });
};

// Upload single image
export const uploadImage = async (req, res) => {
  try {
    console.log("Upload request received:", {
      hasFile: !!req.file,
      hasFiles: !!req.files,
      filesKeys: req.files ? Object.keys(req.files) : [],
    });

    let fileContent;

    // Try to get file data from different possible sources
    if (req.files && req.files.image && req.files.image.length > 0) {
      // Case 1: Using multerUploads with fields
      const file = req.files.image[0];
      fileContent = await dataUri(file);
    } else if (req.file) {
      // Case 2: Using single file upload
      fileContent = await dataUri(req);
    } else {
      // No file found
      return handleError(
        res,
        new Error("No image file found in the request"),
        400
      );
    }

    // Upload to Cloudinary
    const result = await uploader.upload(fileContent, {
      resource_type: "auto",
      folder: "barter/posts",
      allowed_formats: ["jpg", "png", "webp", "jpeg"],
    });

    return res.status(200).json({
      success: true,
      data: {
        public_id: result.public_id,
        url: result.secure_url,
        original_url: result.secure_url,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);
    handleError(res, error);
  }
};

// Delete image by public_id
export const deleteImage = async (req, res) => {
  try {
    const { public_id } = req.params;

    if (!public_id) {
      return handleError(res, new Error("No public_id provided"), 400);
    }

    const result = await cloudinary.uploader.destroy(public_id);

    if (result.result === "not found") {
      return handleError(res, new Error("Image not found"), 404);
    }

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};

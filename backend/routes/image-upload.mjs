import { config, uploader, v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

// Configure Cloudinary with credentials will be moved to .env
config({
  cloud_name: "dcz6aghbq",
  api_key: "724354672218175",
  api_secret: "ft59ETqxJGCKSFpwvngE1UhwSLc",
});

export { uploader, cloudinary };

const storage = multer.memoryStorage(); //multer temporary storage before uploading to cloudinary

// Updated to handle multiple files with different field names
const multerUploads = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, //10MB limit
  },
}).fields([
  { name: "image", maxCount: 1 }, //single image upload
  { name: "postingImages[]", maxCount: 5 }, //Updated field name with array notation
  { name: "postingImages", maxCount: 5 }, //Also include without array notation for compatibility
]);

//Single image upload
const singleImageUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, //10MB limit
  },
}).single("image");

const createDataURI = async (buffer) => {
  //buffer holds the raw data of the image
  const type = await fileTypeFromBuffer(buffer); //It checks the file type from the buffer
  if (!type?.mime.startsWith("image/")) {
    //if it is not an image
    throw new Error("Invalid file type");
  }
  return `data:${type.mime};base64,${buffer.toString("base64")}`; //It creates and returns a data URI (.mime represents the type of the image in a standard formatex: image/jpeg)
};

//Updated to handle both single file and file object
//file object is the computer creates a file object to represent that uploaded file. It contains details about the file ex: size, type, etc.
//A req object is that your computer sends to a server like when you upload a file etc.
//It contains details about what you are asking for. It contains the type of req, any files that are being sent(which are stored in a property called files). This obj can include text fields etc.
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
    //Object.keys() returns an array of a given object's own property names.
    if (fileOrReq.files && Object.keys(fileOrReq.files).length > 0) {
      const fieldName = Object.keys(fileOrReq.files)[0]; //It represents the names of the fields where files were uploaded. For ex: image, postingImages etc.
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

//Upload single image
export const uploadImage = async (req, res) => {
  try {
    console.log("Upload request received:", {
      //!! is a concise way to get a boolean value so you are checking if the file is present or not; (!(not) gives reverse of the boolean value !! gives the correct boolean value)
      hasFile: !!req.file,
      hasFiles: !!req.files,
      filesKeys: req.files ? Object.keys(req.files) : [],
    });

    let fileContent;

    //Try to get file data from different possible sources
    if (req.files && req.files.image && req.files.image.length > 0) {
      //Case 1: Using multerUploads with fields
      const file = req.files.image[0];
      fileContent = await dataUri(file);
    } else if (req.file) {
      //Case 2: Using single file upload
      fileContent = await dataUri(req);
    } else {
      //No file found
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

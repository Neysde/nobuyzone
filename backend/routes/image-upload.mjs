import { fileTypeFromBuffer } from "file-type"; // Restore file-type import
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { isAuthenticated } from "../middlewares.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file. This MUST be at the top, after essential imports for path resolution.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Define storage path
const UPLOAD_DIR = path.join(__dirname, "../public/uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// RESTORED: Memory Storage
const storage = multer.memoryStorage(); 

// File filter to enforce image-only uploads
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images are allowed"), false);
  }
};

// RESTORED: Multer Configuration
const multerUploads = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, //5MB limit (do not change)
  },
  fileFilter: fileFilter,
}).fields([
  { name: "image", maxCount: 1 }, //single image upload
  { name: "postingImages[]", maxCount: 5 }, //Updated field name with array notation
  { name: "postingImages", maxCount: 5 }, //Also include without array notation for compatibility
]);

//Single image upload
const singleImageUpload = multerUploads;

const createDataURI = async (buffer) => {
  //buffer holds the raw data of the image
  const type = await fileTypeFromBuffer(buffer); //It checks the file type from the buffer
  if (!type?.mime.startsWith("image/")) {
    //if it is not an image
    throw new Error("Invalid file type");
  }
  return `data:${type.mime};base64,${buffer.toString("base64")}`; 
};

// RESTORED: Data URI Processing Logic
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

// Main upload logic
export const uploadImage = async (req, res) => {
  try {

    let fileContent;
    const files = [];

    // Try to get file data from different possible sources (RESTORED LOGIC)
    if (req.files) {
        if (req.files.image) files.push(...req.files.image);
        if (req.files["postingImages[]"]) files.push(...req.files["postingImages[]"]);
        if (req.files.postingImages) files.push(...req.files.postingImages);
        if (req.files.file) files.push(...req.files.file); // Handle 'file' field
    } else if (req.file) {
        // Case 2: Using single file upload (legacy fallback)
        files.push(req.file);
    }

    if (files.length === 0) { 
        // Try one last lookup in case we have keys but didn't match above naming
        if (req.files && Object.keys(req.files).length > 0) {
             const firstKey = Object.keys(req.files)[0];
             files.push(...req.files[firstKey]);
        } else {
             return handleError(
                res,
                new Error("No image file found in the request"),
                400
              );
        }
    }

    // NEW: Save to Local Storage instead of Cloudinary
    // Process only the first file for now to match legacy behavior
    const file = files[0];
    fileContent = await dataUri(file); 

    
    // fileContent is a Base64 Data URI: "data:image/png;base64,..."
    const matches = fileContent.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
         throw new Error("Invalid image data URI");
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Determine extension from mime type
    // Simple mapping or split strategy
    let extension = mimeType.split('/')[1];
    if (extension === 'jpeg') extension = 'jpg'; // normalize

    // Generate Secure Random Filename
    const filename = `${uuidv4()}.${extension}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Write file to disk (Async)
    await fs.promises.writeFile(filePath, buffer);

    // Construct URL
    const protocol = req.protocol;
    const host = req.get("host"); 
    const fileUrl = `${protocol}://${host}/uploads/${filename}`;

    return res.status(200).json({
      success: true,
      data: {
        public_id: filename, // Use filename as ID
        url: fileUrl,
        original_url: fileUrl,
      },
    });

  } catch (error) {
    console.error("Image upload error:", error);
    handleError(res, error);
  }
};

// Delete image logic
export const deleteImage = async (req, res, next) => {
  try {
    const { public_id } = req.params; // This is the filename

    if (!public_id) {
      return handleError(res, new Error("No public_id provided"), 400);
    }
    
    const filePath = path.join(UPLOAD_DIR, public_id);

    // Common delete function
    const performDelete = () => {
         if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return res.status(200).json({ success: true, message: "Image deleted successfully." });
         } else {
             return handleError(res, new Error("Image not found locally."), 404);
         }
    };

    // Authorization Check
    if (req.session && req.session.adminUser) {
       performDelete();
    } else {
      isAuthenticated(req, res, () => { 
         performDelete();
      });
    }
  } catch (error) {
    console.error(`Error in deleteImage for ${req.params.public_id}:`, error);
    if (!res.headersSent) { 
        handleError(res, error);
    }
  }
};


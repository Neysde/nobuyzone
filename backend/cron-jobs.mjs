import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "./mongoose/user.mjs";
import mongoose from "mongoose";
import Post from "./mongoose/post.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, "public/uploads");

// Helper to delete file safely
const safelyDeleteFile = async (filename) => {
    if (!filename) return;
    const filePath = path.join(UPLOAD_DIR, filename);
    try {
        await fs.promises.access(filePath); // Check if exists
        await fs.promises.unlink(filePath);
        console.log(`Deleted file: ${filename}`);
    } catch (err) {
        // Ignore if file not found (might be old Cloudinary image or already deleted)
        if (err.code !== 'ENOENT') {
            console.error(`Failed to delete file ${filename}:`, err.message);
        }
    }
};

// Data Retention Policy Implementation
// Run every day at midnight: '0 0 * * *'
export const initializeCronJobs = () => {
    cron.schedule('0 0 * * *', async () => {
      console.log('Running Data Retention Cron Job...');
      const now = new Date();

      // 1. Retention for Users (e.g., 6 months after soft deletion)
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);

      try {
        const usersToDelete = await User.find({
          isDeleted: true,
          deletedAt: { $lt: sixMonthsAgo } 
        });

        if (usersToDelete.length > 0) {
            console.log(`Found ${usersToDelete.length} users to delete permanently.`);
            
            for (const user of usersToDelete) {
                // Delete profile picture if exists
                if (user.profilePicture && user.profilePicture.publicId) {
                    await safelyDeleteFile(user.profilePicture.publicId);
                }
                // Delete the user document
                await User.deleteOne({ _id: user._id });
            }
            console.log(`Permanently deleted ${usersToDelete.length} users.`);
        }
      } catch (error) {
        console.error("Error cleaning up old users:", error);
      }

      // 2. Retention for Posts (e.g., 12 months after soft deletion)
      const twelveMonthsAgo = new Date(now);
      twelveMonthsAgo.setMonth(now.getMonth() - 12);

      try {
        const postsToDelete = await Post.find({
          status: 'deleted',
          updatedAt: { $lt: twelveMonthsAgo }
        });

        if (postsToDelete.length > 0) {
            console.log(`Found ${postsToDelete.length} posts to delete permanently.`);

            for (const post of postsToDelete) {
                 // Delete all associated images
                 if (post.images && post.images.length > 0) {
                     for (const image of post.images) {
                         await safelyDeleteFile(image.publicId);
                     }
                 }
                 // Delete the post document
                 await Post.deleteOne({ _id: post._id });
            }
            console.log(`Permanently deleted ${postsToDelete.length} posts.`);
        }
      } catch (error) {
        console.error("Error cleaning up old posts:", error);
      }

    });
    
    // Log Retention Policy (2 years)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running Log Retention Cron Job...');
        
        try {
            // 1. Rotate the MongoDB log
            // This renames existing log file and creates a new one
            if (mongoose.connection.readyState === 1) {
                 const adminDb = mongoose.connection.db.admin();
                 await adminDb.command({ logRotate: 1 });
                 console.log('MongoDB log rotated successfully.');
            } else {
                console.log('MongoDB not connected, skipping log rotation.');
            }

            // 2. Clean up old logs (> 2 years)
            const logDir = '/var/log/mongodb';
            // Check if directory exists before reading
            try {
                await fs.promises.access(logDir);
            } catch (e) {
                console.log(`Log directory ${logDir} does not exist. Skipping cleanup.`);
                return;
            }

            const files = await fs.promises.readdir(logDir);
            const now = new Date();
            const twoYearsAgo = new Date(now);
            twoYearsAgo.setFullYear(now.getFullYear() - 2);

            for (const file of files) {
                // Skip the current active log file (mongod.log)
                if (file === 'mongod.log') continue;

                const filePath = path.join(logDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.mtime < twoYearsAgo) {
                            await fs.promises.unlink(filePath);
                            console.log(`Deleted old log file: ${file}`);
                    }
                } catch (err) {
                    console.error(`Error processing log file ${file}:`, err.message);
                }
            }
        } catch (error) {
            console.error("Error in Log Retention Job:", error);
        }
    });
};


export default cron;

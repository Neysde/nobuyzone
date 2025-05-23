/**
 * Migration script to normalize location data in existing posts
 * 
 * This script will:
 * 1. Connect to MongoDB
 * 2. Find all posts
 * 3. Trim city, district, and neighborhood fields
 * 
 * Run with: node backend/scripts/normalizeLocations.mjs
 */

import mongoose from 'mongoose';
import Post from '../mongoose/post.mjs';

// MongoDB connection string - replace with your actual connection string
const MONGODB_URI = 'mongodb://localhost:27017/nobuyzone-app';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

/**
 * Normalize text by removing diacritics and converting to lowercase
 * This will help with search consistency by normalizing characters like İ->i, ş->s, etc.
 * @param {string} text - The text to normalize
 * @returns {string} - Normalized text
 */
const normalizeText = (text) => {
  if (!text) return '';
  
  // Convert to lowercase and normalize Unicode characters
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
    .replace(/[^a-z0-9\s]/g, ''); // Remove non-alphanumeric characters
};

/**
 * Normalize location data in all posts
 */
async function normalizeLocationData() {
  try {
    console.log('Starting location data normalization...');
    
    // Get total count for progress tracking
    const totalCount = await Post.countDocuments();
    console.log(`Found ${totalCount} posts to process`);
    
    // Process in batches
    const batchSize = 100;
    let processedCount = 0;
    let updatedCount = 0;
    
    // Process in chunks to avoid memory issues
    for (let skip = 0; skip < totalCount; skip += batchSize) {
      // Get batch of posts
      const posts = await Post.find().skip(skip).limit(batchSize);
      console.log(`Processing batch ${Math.floor(skip/batchSize) + 1}, posts ${skip+1} to ${Math.min(skip+batchSize, totalCount)}`);
      
      // Process each post in the batch
      for (const post of posts) {
        let changed = false;
        
        // Trim location fields
        ['city', 'district', 'neighborhood'].forEach(field => {
          if (post.location && post.location[field]) {
            const original = post.location[field];
            let trimmed = original.trim();
            
            // Apply trimming
            if (original !== trimmed) {
              post.location[field] = trimmed;
              console.log(`Trimmed ${field}: "${original}" -> "${trimmed}"`);
              changed = true;
            }
          }
        });
        
        // Save if changed
        if (changed) {
          await post.save();
          updatedCount++;
        }
        
        processedCount++;
      }
      
      console.log(`Progress: ${processedCount}/${totalCount} posts processed (${Math.round(processedCount/totalCount*100)}%), ${updatedCount} updated`);
    }
    
    console.log('Normalization complete!');
    console.log(`Processed ${processedCount} posts, updated ${updatedCount}`);
    
  } catch (error) {
    console.error('Error normalizing location data:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the normalization
normalizeLocationData(); 
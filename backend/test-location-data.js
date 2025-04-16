import mongoose from 'mongoose';

// Connection string
const connectionString = "mongodb+srv://root:1Ow6PKsLv1It8K2S@cluster0.ok6h4.mongodb.net/bartertest?retryWrites=true&w=majority&appName=Cluster0";

async function testLocationSearch() {
  try {
    // Connect to MongoDB
    await mongoose.connect(connectionString);
    console.log('Connected to MongoDB');
    
    // Create a simple schema for posts
    const PostSchema = new mongoose.Schema({}, { collection: 'posts', strict: false });
    const Post = mongoose.model('Post', PostSchema);
    
    // Find all posts
    const allPosts = await Post.find({ status: 'active' });
    console.log(`Total active posts: ${allPosts.length}`);
    
    // Extract unique cities and districts
    const cities = new Set();
    const districts = new Set();
    
    allPosts.forEach(post => {
      if (post.location && post.location.city) {
        cities.add(post.location.city);
      }
      if (post.location && post.location.district) {
        districts.add(post.location.district);
      }
    });
    
    console.log('\nUnique cities:');
    console.log([...cities].sort());
    
    console.log('\nUnique districts:');
    console.log([...districts].sort());
    
    // Test specific searches
    console.log('\nTesting searches:');
    
    // 1. Search for İstanbul
    const istanbulPosts = await Post.find({ 'location.city': { $regex: 'İstanbul', $options: 'i' } });
    console.log(`Posts with İstanbul: ${istanbulPosts.length}`);
    
    // 2. Search for Istanbul (without dot)
    const istanbulNoDotPosts = await Post.find({ 'location.city': { $regex: 'Istanbul', $options: 'i' } });
    console.log(`Posts with Istanbul (no dot): ${istanbulNoDotPosts.length}`);
    
    // 3. Search for Beylikdüzü
    const beylikduzuPosts = await Post.find({ 'location.district': { $regex: 'Beylikdüzü', $options: 'i' } });
    console.log(`Posts with Beylikdüzü: ${beylikduzuPosts.length}`);
    
    // 4. Search for BEYLİKDÜZÜ
    const BEYLIKDUZU_posts = await Post.find({ 'location.district': { $regex: 'BEYLİKDÜZÜ', $options: 'i' } });
    console.log(`Posts with BEYLİKDÜZÜ: ${BEYLIKDUZU_posts.length}`);
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testLocationSearch(); 
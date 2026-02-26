const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local-db'), override: true, quiet: true });

const MONGO_URI = process.env.MONGO_URI;

// Simple community schema for querying
const communitySchema = new mongoose.Schema({}, { strict: false });

async function listCommunities() {
  try {
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is missing. Set it in .env or .env.local-db');
    }

    console.log('🔗 Connecting to MongoDB from MONGO_URI...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const Community = mongoose.model('Community', communitySchema);

    // Get all communities
    const communities = await Community.find({}).lean();

    console.log(`📊 Found ${communities.length} communities:\n`);

    communities.forEach((c, i) => {
      console.log(`\n${i + 1}. ${c.name || c.titre || 'No name'}`);
      console.log(`   ID: ${c._id}`);
      console.log(`   Slug: ${c.slug || 'N/A'}`);
      console.log(`   Creator: ${c.createur || c.creator || 'N/A'}`);
      console.log(`   Active: ${c.isActive ?? 'N/A'}`);
      console.log(`   Private: ${c.isPrivate ?? 'N/A'}`);
      console.log(`   Members: ${c.members?.length || 0}`);
      console.log(`   Description: ${(c.description || c.descriptionShort || 'N/A').substring(0, 80)}...`);
      if (c.tags && c.tags.length > 0) {
        console.log(`   Tags: ${c.tags.join(', ')}`);
      }
    });

    console.log('\n' + '='.repeat(50));
    console.log(`Total: ${communities.length} communities in database`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

listCommunities();

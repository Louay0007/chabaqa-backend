/**
 * Script to fix user roles in the database
 * This normalizes all uppercase roles to lowercase to match the schema enum
 * 
 * Usage: node scripts/fix-user-roles.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixUserRoles() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shabaka';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get the User collection
    const User = mongoose.connection.collection('users');

    // Find all users with uppercase roles
    const usersWithUppercaseRoles = await User.find({
      role: { $regex: /^[A-Z]+$/ } // Match uppercase roles like 'USER', 'CREATOR'
    }).toArray();

    console.log(`\n📊 Found ${usersWithUppercaseRoles.length} users with uppercase roles`);

    if (usersWithUppercaseRoles.length === 0) {
      console.log('✅ No users to fix!');
      process.exit(0);
    }

    // Update each user
    let fixedCount = 0;
    for (const user of usersWithUppercaseRoles) {
      const lowercaseRole = user.role.toLowerCase();
      await User.updateOne(
        { _id: user._id },
        { $set: { role: lowercaseRole } }
      );
      console.log(`✅ Fixed user ${user.email}: ${user.role} → ${lowercaseRole}`);
      fixedCount++;
    }

    console.log(`\n✅ Successfully fixed ${fixedCount} users`);
    console.log('🎉 All user roles are now normalized to lowercase');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
fixUserRoles();

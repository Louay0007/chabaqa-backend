/**
 * Get 2FA verification code for admin login testing
 * Usage: node scripts/get-2fa-code.js admin@local.com
 */

require('dotenv').config();
const mongoose = require('mongoose');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/get-2fa-code.js <email>');
  process.exit(1);
}

async function get2FACode() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get the verification code model
    const VerificationCode = mongoose.model('VerificationCode', new mongoose.Schema({
      adminId: mongoose.Schema.Types.ObjectId,
      code: String,
      type: String,
      expiresAt: Date,
      rememberMe: Boolean,
    }), 'verificationcodes');

    // Find admin by email
    const Admin = mongoose.model('Admin', new mongoose.Schema({
      email: String,
      name: String,
      role: String,
    }), 'admins');

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    
    if (!admin) {
      console.error(`Admin not found with email: ${email}`);
      process.exit(1);
    }

    // Find the latest 2FA code for this admin
    const verificationCode = await VerificationCode
      .findOne({ 
        adminId: admin._id, 
        type: '2fa',
        expiresAt: { $gt: new Date() }
      })
      .sort({ _id: -1 });

    if (!verificationCode) {
      console.error('No valid 2FA code found. Please login first to generate a code.');
      process.exit(1);
    }

    console.log('\n=================================');
    console.log('2FA Verification Code');
    console.log('=================================');
    console.log(`Email: ${email}`);
    console.log(`Code: ${verificationCode.code}`);
    console.log(`Expires: ${verificationCode.expiresAt}`);
    console.log('=================================\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

get2FACode();

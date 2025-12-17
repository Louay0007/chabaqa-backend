#!/usr/bin/env node

/**
 * Database Export Script
 * Exports all database data to a comprehensive markdown report
 * Shows creators, communities, enrollments, and all related details
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@chabaqa.bmmujoq.mongodb.net/?appName=chabaqa';

let markdown = '';

function addSection(title, level = 1) {
  const prefix = '#'.repeat(level);
  markdown += `\n${prefix} ${title}\n\n`;
}

function addTable(headers, rows) {
  if (rows.length === 0) {
    markdown += '_No data_\n\n';
    return;
  }

  // Header
  markdown += `| ${headers.join(' | ')} |\n`;
  markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

  // Rows
  rows.forEach(row => {
    markdown += `| ${row.map(cell => String(cell || '-').replace(/\|/g, '\\|')).join(' | ')} |\n`;
  });
  markdown += '\n';
}

async function exportDatabase() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`📊 Found ${collections.length} collections`);

    // Start markdown document
    markdown += '# 📊 Database Export Report\n';
    markdown += `Generated: ${new Date().toISOString()}\n`;
    markdown += `Database: ${MONGO_URI}\n`;

    // ===== USERS SECTION =====
    addSection('👥 Users');
    const users = await db.collection('users').find({}).toArray();
    console.log(`📝 Found ${users.length} users`);

    const userRows = users.map(u => [
      u._id.toString().substring(0, 8),
      u.name || 'N/A',
      u.email || 'N/A',
      u.role || 'member',
      new Date(u.createdAt).toLocaleDateString()
    ]);
    addTable(['ID', 'Name', 'Email', 'Role', 'Created'], userRows);

    // ===== COMMUNITIES SECTION =====
    addSection('🏘️ Communities');
    const communities = await db.collection('communities').find({}).toArray();
    console.log(`📝 Found ${communities.length} communities`);

    for (const community of communities) {
      const creator = users.find(u => u._id.equals(community.createur));
      const memberCount = community.members?.length || 0;
      const adminCount = community.admins?.length || 0;

      addSection(`${community.name}`, 3);
      markdown += `**Creator:** ${creator?.name || 'Unknown'} (${creator?.email || 'N/A'})\n`;
      markdown += `**Slug:** ${community.slug}\n`;
      markdown += `**Category:** ${community.category || 'N/A'}\n`;
      markdown += `**Description:** ${community.short_description || 'N/A'}\n`;
      markdown += `**Price Type:** ${community.priceType || 'free'}\n`;
      markdown += `**Members:** ${memberCount}\n`;
      markdown += `**Admins:** ${adminCount}\n`;
      markdown += `**Created:** ${new Date(community.createdAt).toLocaleDateString()}\n\n`;

      // Community Members
      if (memberCount > 0) {
        addSection('Members', 4);
        const memberIds = community.members || [];
        const memberDetails = memberIds.map(memberId => {
          const member = users.find(u => u._id.equals(memberId));
          return [member?.name || 'Unknown', member?.email || 'N/A'];
        });
        addTable(['Name', 'Email'], memberDetails);
      }

      // Community Courses
      const courses = await db.collection('courses').find({ communityId: community._id.toString() }).toArray();
      if (courses.length > 0) {
        addSection('Courses', 4);
        const courseRows = courses.map(c => [
          c.titre || c.title || 'Untitled',
          c.enrollments?.length || 0,
          c.isPublished ? '✅' : '❌',
          new Date(c.createdAt).toLocaleDateString()
        ]);
        addTable(['Title', 'Enrollments', 'Published', 'Created'], courseRows);
      }

      // Community Challenges
      const challenges = await db.collection('challenges').find({ communityId: community._id.toString() }).toArray();
      if (challenges.length > 0) {
        addSection('Challenges', 4);
        const challengeRows = challenges.map(ch => [
          ch.title || 'Untitled',
          ch.participants?.length || 0,
          ch.isActive ? '✅' : '❌',
          new Date(ch.createdAt).toLocaleDateString()
        ]);
        addTable(['Title', 'Participants', 'Active', 'Created'], challengeRows);
      }

      // Community Products
      const products = await db.collection('products').find({ communityId: community._id.toString() }).toArray();
      if (products.length > 0) {
        addSection('Products', 4);
        const productRows = products.map(p => [
          p.title || 'Untitled',
          p.price || 0,
          p.sales || 0,
          p.isPublished ? '✅' : '❌',
          new Date(p.createdAt).toLocaleDateString()
        ]);
        addTable(['Title', 'Price', 'Sales', 'Published', 'Created'], productRows);
      }

      // Community Posts
      const posts = await db.collection('posts').find({ communityId: community._id.toString() }).toArray();
      if (posts.length > 0) {
        addSection('Posts', 4);
        const postRows = posts.map(p => {
          const author = users.find(u => u._id.equals(p.authorId));
          return [
            p.title || '(No title)',
            author?.name || 'Unknown',
            p.likes || 0,
            new Date(p.createdAt).toLocaleDateString()
          ];
        });
        addTable(['Title', 'Author', 'Likes', 'Created'], postRows);
      }

      // Community Sessions
      const sessions = await db.collection('sessions').find({ communityId: community._id.toString() }).toArray();
      if (sessions.length > 0) {
        addSection('Sessions', 4);
        const sessionRows = sessions.map(s => [
          s.title || 'Untitled',
          s.bookings?.length || 0,
          new Date(s.createdAt).toLocaleDateString()
        ]);
        addTable(['Title', 'Bookings', 'Created'], sessionRows);
      }

      // Community Events
      const events = await db.collection('events').find({ communityId: community._id.toString() }).toArray();
      if (events.length > 0) {
        addSection('Events', 4);
        const eventRows = events.map(e => [
          e.title || 'Untitled',
          e.registrations?.length || 0,
          e.isPublished ? '✅' : '❌',
          new Date(e.createdAt).toLocaleDateString()
        ]);
        addTable(['Title', 'Registrations', 'Published', 'Created'], eventRows);
      }
    }

    // ===== ENROLLMENTS SECTION =====
    addSection('📚 Course Enrollments');
    const enrollments = await db.collection('courseenrollments').find({}).toArray();
    console.log(`📝 Found ${enrollments.length} enrollments`);

    const enrollmentRows = enrollments.map(e => {
      const user = users.find(u => u._id.equals(e.userId));
      const course = (async () => {
        const c = await db.collection('courses').findOne({ _id: e.courseId });
        return c?.titre || c?.title || 'Unknown';
      })();
      return [
        user?.name || 'Unknown',
        user?.email || 'N/A',
        e.progress || 0 + '%',
        e.isCompleted ? '✅' : '❌',
        new Date(e.enrolledAt).toLocaleDateString()
      ];
    });
    addTable(['User', 'Email', 'Progress', 'Completed', 'Enrolled'], enrollmentRows);

    // ===== ORDERS SECTION =====
    addSection('💳 Orders');
    const orders = await db.collection('orders').find({}).toArray();
    console.log(`📝 Found ${orders.length} orders`);

    const orderRows = orders.map(o => {
      const user = users.find(u => u._id.equals(o.userId));
      return [
        user?.name || 'Unknown',
        o.totalAmount || 0,
        o.status || 'pending',
        o.contentType || 'N/A',
        new Date(o.createdAt).toLocaleDateString()
      ];
    });
    addTable(['User', 'Amount', 'Status', 'Type', 'Created'], orderRows);

    // ===== SUBSCRIPTIONS SECTION =====
    addSection('🎯 Subscriptions');
    const subscriptions = await db.collection('subscriptions').find({}).toArray();
    console.log(`📝 Found ${subscriptions.length} subscriptions`);

    const subscriptionRows = subscriptions.map(s => {
      const user = users.find(u => u._id.equals(s.userId));
      return [
        user?.name || 'Unknown',
        s.plan || 'N/A',
        s.status || 'active',
        s.renewalDate ? new Date(s.renewalDate).toLocaleDateString() : 'N/A'
      ];
    });
    addTable(['User', 'Plan', 'Status', 'Renewal Date'], subscriptionRows);

    // ===== SUMMARY STATISTICS =====
    addSection('📈 Summary Statistics');
    markdown += `- **Total Users:** ${users.length}\n`;
    markdown += `- **Total Communities:** ${communities.length}\n`;
    markdown += `- **Total Courses:** ${await db.collection('courses').countDocuments()}\n`;
    markdown += `- **Total Challenges:** ${await db.collection('challenges').countDocuments()}\n`;
    markdown += `- **Total Products:** ${await db.collection('products').countDocuments()}\n`;
    markdown += `- **Total Posts:** ${await db.collection('posts').countDocuments()}\n`;
    markdown += `- **Total Orders:** ${orders.length}\n`;
    markdown += `- **Total Subscriptions:** ${subscriptions.length}\n`;
    markdown += `- **Total Enrollments:** ${enrollments.length}\n\n`;

    // Write to file
    const outputPath = path.join(__dirname, '../DATABASE_EXPORT.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`✅ Database export saved to: ${outputPath}`);

    // Also log summary
    console.log('\n📊 Export Summary:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Communities: ${communities.length}`);
    console.log(`   Courses: ${await db.collection('courses').countDocuments()}`);
    console.log(`   Orders: ${orders.length}`);
    console.log(`   Subscriptions: ${subscriptions.length}`);

  } catch (error) {
    console.error('❌ Error exporting database:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run export
exportDatabase();

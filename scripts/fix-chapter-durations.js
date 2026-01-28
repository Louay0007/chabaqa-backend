/**
 * Script to fix chapter durations that are set to 0
 * This will set a default duration of 5 minutes for video chapters
 * Run with: node scripts/fix-chapter-durations.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixChapterDurations() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const coursesCollection = db.collection('cours');

    console.log('\n📊 Finding courses with chapters that have 0 duration...');
    
    const courses = await coursesCollection.find({}).toArray();
    console.log(`Found ${courses.length} courses to check`);

    let totalUpdated = 0;
    let coursesUpdated = 0;

    for (const course of courses) {
      let courseModified = false;
      
      if (course.sections && Array.isArray(course.sections)) {
        for (const section of course.sections) {
          if (section.chapitres && Array.isArray(section.chapitres)) {
            for (const chapter of section.chapitres) {
              // If chapter has a video URL but duration is 0 or undefined
              if (chapter.videoUrl && (!chapter.duree || chapter.duree === 0 || chapter.duree === '0')) {
                console.log(`   📝 Updating chapter: "${chapter.titre}" (ID: ${chapter.id})`);
                console.log(`      Video URL: ${chapter.videoUrl}`);
                console.log(`      Old duration: ${chapter.duree || 0} minutes`);
                chapter.duree = 3; // Set default 3 minutes (close to 2:38)
                console.log(`      New duration: ${chapter.duree} minutes`);
                courseModified = true;
                totalUpdated++;
              }
            }
          }
        }
      }

      if (courseModified) {
        await coursesCollection.updateOne(
          { _id: course._id },
          { $set: { sections: course.sections } }
        );
        coursesUpdated++;
        console.log(`   ✅ Updated course: "${course.titre}"`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Courses checked: ${courses.length}`);
    console.log(`   Courses updated: ${coursesUpdated}`);
    console.log(`   Chapters updated: ${totalUpdated}`);
    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 Note: The actual video duration will be updated automatically when users watch the videos.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixChapterDurations();

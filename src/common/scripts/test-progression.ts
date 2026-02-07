import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ContentTrackingService } from '../services/content-tracking.service';
import { TrackableContentType, TrackingActionType } from '../../schema/content-tracking.schema';
import { Types } from 'mongoose';
import { EmailService } from '../services/email.service';

// Mock Email Service to avoid errors
const mockEmailService = {
  sendPasswordResetEmail: async () => {},
  sendEmail: async () => {},
  send2FACode: async () => true,
  sendGenericEmail: async () => {},
  sendAccountSuspensionEmail: async () => {},
  sendAccountActivationEmail: async () => {},
  sendPasswordResetByAdminEmail: async () => {},
};

async function testProgressionFlow() {
  console.log('🚀 Starting Progression Tracking Simulation...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  // Override EmailService if it causes issues in testing environment
  const emailService = app.get(EmailService);
  Object.assign(emailService, mockEmailService);
  
  const trackingService = app.get(ContentTrackingService);
  
  const userId = new Types.ObjectId().toString(); // Simulate a new user
  const courseId = 'course-101'; // Mock content ID
  const videoId = 'video-202';

  try {
    // 1. User starts a course (0% progress)
    console.log('\n1️⃣ User starts a course...');
    const startProgress = await trackingService.trackStart(userId, courseId, TrackableContentType.COURSE);
    console.log(`   - Status: ${startProgress.isCompleted ? 'Completed' : 'Started'}`);
    console.log(`   - Last Accessed: ${startProgress.lastAccessedAt}`);

    // 2. User watches a video (Partial Progress - Time Based)
    console.log('\n2️⃣ User watches 15 mins of video...');
    await trackingService.updateWatchTime(userId, videoId, TrackableContentType.SESSION, 900); // 900 seconds
    const videoProgress = await trackingService.updateProgress(
        userId, 
        videoId, 
        TrackableContentType.SESSION, 
        25, // 25% watched
        { duration: 3600 } // 1 hour total duration
    );
    console.log(`   - Video Progress: ${videoProgress.metadata['progressPercent']}%`);
    console.log(`   - Watch Time: ${videoProgress.watchTime}s`);

    // 3. User completes chapters in the course (Structured Progress)
    console.log('\n3️⃣ User completes 2 out of 5 chapters...');
    const midCourseProgress = await trackingService.updateProgress(
        userId, 
        courseId, 
        TrackableContentType.COURSE, 
        40, // 40%
        { completedChapters: 2, totalChapters: 5 }
    );
    console.log(`   - Course Progress: ${midCourseProgress.metadata['progressPercent']}%`);
    console.log(`   - Metadata:`, midCourseProgress.metadata);

    // 4. User completes the course (100% Completion)
    console.log('\n4️⃣ User completes the course!');
    const completeProgress = await trackingService.updateProgress(
        userId, 
        courseId, 
        TrackableContentType.COURSE, 
        100,
        { completedChapters: 5, totalChapters: 5 }
    );
    console.log(`   - Is Completed: ${completeProgress.isCompleted}`);
    console.log(`   - Completed At: ${completeProgress.completedAt}`);
    
    // 5. Verify Stats Aggregation
    console.log('\n5️⃣ Verifying Content Stats...');
    const stats = await trackingService.getContentStats(courseId, TrackableContentType.COURSE);
    console.log(`   - Total Views: ${stats.totalViews}`);
    console.log(`   - Total Completed: ${stats.totalCompleted}`);

    console.log('\n✅ Simulation Completed Successfully!');

  } catch (error) {
    console.error('❌ Simulation Failed:', error);
  } finally {
    await app.close();
  }
}

testProgressionFlow();

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Achievement, AchievementSchema, AchievementCriteriaType } from '../../schema/achievement.schema';

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shabaka';
  console.log('Connecting to MongoDB at', mongoUri);
  await mongoose.connect(mongoUri);
  const AchievementModel = mongoose.model(Achievement.name, AchievementSchema);

  const achievements = [
    // --- JOIN DATE (LOYALTY) ---
    {
      name: 'Welcome Aboard',
      description: 'Join the community',
      icon: '👋',
      criteria: { type: AchievementCriteriaType.COMMUNITY_JOIN_DATE, days: 0 },
      rarity: 'common',
      points: 10,
      tags: ['loyalty', 'beginner'],
      order: 1,
    },
    {
      name: 'Loyal Member',
      description: 'Be a member for 1 month',
      icon: '🗓️',
      criteria: { type: AchievementCriteriaType.COMMUNITY_JOIN_DATE, monthsSinceJoin: 1 },
      rarity: 'common',
      points: 100,
      tags: ['loyalty'],
      order: 2,
    },
    {
      name: 'Veteran',
      description: 'Be a member for 6 months',
      icon: '🏅',
      criteria: { type: AchievementCriteriaType.COMMUNITY_JOIN_DATE, monthsSinceJoin: 6 },
      rarity: 'epic',
      points: 500,
      tags: ['loyalty'],
      order: 3,
    },
    {
      name: 'Legend',
      description: 'Be a member for 1 year',
      icon: '👑',
      criteria: { type: AchievementCriteriaType.COMMUNITY_JOIN_DATE, monthsSinceJoin: 12 },
      rarity: 'legendary',
      points: 1000,
      tags: ['loyalty'],
      order: 4,
    },

    // --- POST CREATION (ACTIVITY) ---
    {
      name: 'First Post',
      description: 'Create your first post',
      icon: '📝',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'post', count: 1 },
      rarity: 'common',
      points: 50,
      tags: ['activity', 'poster'],
      order: 10,
    },
    {
      name: 'Conversation Starter',
      description: 'Create 5 posts',
      icon: '🗣️',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'post', count: 5 },
      rarity: 'common',
      points: 150,
      tags: ['activity', 'poster'],
      order: 11,
    },
    {
      name: 'Community Pillar',
      description: 'Create 20 posts',
      icon: '🏛️',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'post', count: 20 },
      rarity: 'rare',
      points: 500,
      tags: ['activity', 'poster'],
      order: 12,
    },
    {
      name: 'Influencer',
      description: 'Create 50 posts',
      icon: '🌟',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'post', count: 50 },
      rarity: 'epic',
      points: 1000,
      tags: ['activity', 'poster'],
      order: 13,
    },

    // --- COMMENT CREATION (ENGAGEMENT) ---
    {
      name: 'Engaged',
      description: 'Post 10 comments',
      icon: '💬',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'comment', count: 10 },
      rarity: 'common',
      points: 100,
      tags: ['engagement', 'commenter'],
      order: 20,
    },
    {
      name: 'Top Commenter',
      description: 'Post 50 comments',
      icon: '🏆',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'comment', count: 50 },
      rarity: 'rare',
      points: 300,
      tags: ['engagement', 'commenter'],
      order: 21,
    },
    {
      name: 'Discussion Leader',
      description: 'Post 200 comments',
      icon: '📢',
      criteria: { type: AchievementCriteriaType.COUNT_CREATED, contentType: 'comment', count: 200 },
      rarity: 'epic',
      points: 800,
      tags: ['engagement', 'commenter'],
      order: 22,
    },

    // --- LEARNING (COURSES) ---
    {
      name: 'Learner',
      description: 'Complete 1 course',
      icon: '🎓',
      criteria: { type: AchievementCriteriaType.COUNT_COMPLETED, contentType: 'course', count: 1 },
      rarity: 'common',
      points: 100,
      tags: ['learning'],
      order: 30,
    },
    {
      name: 'Scholar',
      description: 'Complete 5 courses',
      icon: '📚',
      criteria: { type: AchievementCriteriaType.COUNT_COMPLETED, contentType: 'course', count: 5 },
      rarity: 'epic',
      points: 500,
      tags: ['learning'],
      order: 31,
    },
    
    // --- WEALTH (POINTS) ---
    {
      name: 'Rising Star',
      description: 'Earn 500 points',
      icon: '⭐',
      criteria: { type: AchievementCriteriaType.POINTS_EARNED, points: 500 },
      rarity: 'common',
      points: 50, // Bonus points
      tags: ['wealth'],
      order: 40,
    },
    {
      name: 'High Roller',
      description: 'Earn 2000 points',
      icon: '💎',
      criteria: { type: AchievementCriteriaType.POINTS_EARNED, points: 2000 },
      rarity: 'rare',
      points: 200,
      tags: ['wealth'],
      order: 41,
    },
    {
      name: 'Millionaire',
      description: 'Earn 10000 points',
      icon: '💰',
      criteria: { type: AchievementCriteriaType.POINTS_EARNED, points: 10000 },
      rarity: 'legendary',
      points: 1000,
      tags: ['wealth'],
      order: 42,
    }
  ];

  for (const ach of achievements) {
    // Use upsert to avoid duplicates
    await AchievementModel.updateOne(
      { name: ach.name },
      { 
        $set: {
          ...ach,
          id: new Types.ObjectId().toString(), // Generate ID if new
          isActive: true
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    console.log(`Seeded achievement: ${ach.name}`);
  }

  console.log('Done seeding achievements.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

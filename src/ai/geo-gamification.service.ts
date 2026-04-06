import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GeoUserProfile,
  GeoUserProfileDocument,
  GeoDifficultyLevel,
} from '../schema/geo-user-profile.schema';

export const GEO_ACHIEVEMENTS = [
  // Question-based
  { identifier: 'curious_learner', title: 'Curious Learner', description: 'Asked 10 questions to Geo', icon: '🤔', points: 50, type: 'question', threshold: 10 },
  { identifier: 'knowledge_seeker', title: 'Knowledge Seeker', description: 'Asked 50 questions to Geo', icon: '🔍', points: 200, type: 'question', threshold: 50 },
  { identifier: 'question_master', title: 'Question Master', description: 'Asked 100 questions to Geo', icon: '🎓', points: 500, type: 'question', threshold: 100 },
  // Quiz-based
  { identifier: 'quiz_novice', title: 'Quiz Novice', description: 'Completed 5 quizzes', icon: '📝', points: 100, type: 'quiz', threshold: 5 },
  { identifier: 'quiz_expert', title: 'Quiz Expert', description: 'Completed 20 quizzes', icon: '🏅', points: 300, type: 'quiz', threshold: 20 },
  { identifier: 'quiz_champion', title: 'Quiz Champion', description: 'Completed 50 quizzes', icon: '🏆', points: 1000, type: 'quiz', threshold: 50 },
  // Streak-based
  { identifier: 'week_warrior', title: 'Week Warrior', description: '7-day learning streak with Geo', icon: '🔥', points: 100, type: 'streak', threshold: 7 },
  { identifier: 'month_master', title: 'Month Master', description: '30-day learning streak with Geo', icon: '⭐', points: 500, type: 'streak', threshold: 30 },
  { identifier: 'consistency_king', title: 'Consistency King', description: '100-day learning streak', icon: '👑', points: 2000, type: 'streak', threshold: 100 },
  // Points-based
  { identifier: 'point_collector', title: 'Point Collector', description: 'Earned 100 points with Geo', icon: '💰', points: 0, type: 'points', threshold: 100 },
  { identifier: 'point_master', title: 'Point Master', description: 'Earned 1000 points with Geo', icon: '💎', points: 0, type: 'points', threshold: 1000 },
  // Visual learner
  { identifier: 'visual_learner', title: 'Visual Learner', description: 'Shared 10 images with Geo', icon: '📸', points: 150, type: 'images', threshold: 10 },
];

@Injectable()
export class GeoGamificationService {
  private readonly logger = new Logger(GeoGamificationService.name);

  constructor(
    @InjectModel(GeoUserProfile.name)
    private geoProfileModel: Model<GeoUserProfileDocument>,
  ) {}

  async getOrCreateProfile(userId: Types.ObjectId): Promise<GeoUserProfileDocument> {
    let profile = await this.geoProfileModel.findOne({ userId }).lean();
    if (!profile) {
      try {
        const created = await this.geoProfileModel.create({ userId });
        return created as any;
      } catch (e: any) {
        // Race condition — find again
        profile = await this.geoProfileModel.findOne({ userId }).lean();
      }
    }
    return profile as any;
  }

  async getProfile(userId: Types.ObjectId | string): Promise<any> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOne({ userId: uid }).lean();
    if (!profile) {
      return {
        totalPoints: 0,
        questionsAsked: 0,
        quizzesCompleted: 0,
        imagesShared: 0,
        currentStreak: 0,
        bestStreak: 0,
        preferredDifficultyLevel: 'intermediate',
        unlockedAchievements: [],
      };
    }
    return profile;
  }

  async updateDifficultyPreference(
    userId: Types.ObjectId | string,
    level: GeoDifficultyLevel,
  ): Promise<any> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      { $set: { preferredDifficultyLevel: level }, $setOnInsert: { userId: uid } },
      { upsert: true, new: true },
    );
    return profile;
  }

  async awardPoints(
    userId: Types.ObjectId | string,
    points: number,
  ): Promise<{ totalPoints: number; newAchievements: string[] }> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      { $inc: { totalPoints: points }, $setOnInsert: { userId: uid } },
      { upsert: true, new: true },
    );

    const newAchievements = await this.checkAndUnlockAchievements(uid, 'points', profile!.totalPoints, profile!.unlockedAchievements);
    return { totalPoints: profile!.totalPoints, newAchievements };
  }

  async incrementQuestionsAsked(userId: Types.ObjectId | string): Promise<{ questionsAsked: number; newAchievements: string[] }> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      { $inc: { questionsAsked: 1, totalPoints: 5 }, $setOnInsert: { userId: uid } },
      { upsert: true, new: true },
    );
    const newAchievements = await this.checkAndUnlockAchievements(uid, 'question', profile!.questionsAsked, profile!.unlockedAchievements);
    return { questionsAsked: profile!.questionsAsked, newAchievements };
  }

  async incrementQuizzesCompleted(userId: Types.ObjectId | string, pointsEarned: number): Promise<{ quizzesCompleted: number; newAchievements: string[] }> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      { $inc: { quizzesCompleted: 1, totalPoints: pointsEarned }, $setOnInsert: { userId: uid } },
      { upsert: true, new: true },
    );
    const newAchievements = await this.checkAndUnlockAchievements(uid, 'quiz', profile!.quizzesCompleted, profile!.unlockedAchievements);
    return { quizzesCompleted: profile!.quizzesCompleted, newAchievements };
  }

  async incrementImagesShared(userId: Types.ObjectId | string): Promise<{ imagesShared: number; newAchievements: string[] }> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      { $inc: { imagesShared: 1, totalPoints: 5 }, $setOnInsert: { userId: uid } },
      { upsert: true, new: true },
    );
    const newAchievements = await this.checkAndUnlockAchievements(uid, 'images', profile!.imagesShared, profile!.unlockedAchievements);
    return { imagesShared: profile!.imagesShared, newAchievements };
  }

  async updateStreak(userId: Types.ObjectId | string): Promise<{ currentStreak: number; newAchievements: string[] }> {
    const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const profile = await this.geoProfileModel.findOne({ userId: uid }).lean();
    const now = new Date();

    let newStreak = 1;
    if (profile?.lastInteractionDate) {
      const last = new Date(profile.lastInteractionDate);
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDiff = Math.floor((now.getTime() - last.getTime()) / msPerDay);

      if (daysDiff === 0) {
        // Same day, keep streak
        newStreak = profile.currentStreak || 1;
      } else if (daysDiff === 1) {
        // Consecutive day, increase streak
        newStreak = (profile.currentStreak || 0) + 1;
      } else {
        // Streak broken
        newStreak = 1;
      }
    }

    const newBest = Math.max(newStreak, profile?.bestStreak || 0);
    const bonusPoints = newStreak > 1 ? 10 : 0; // streak bonus

    const updated = await this.geoProfileModel.findOneAndUpdate(
      { userId: uid },
      {
        $set: {
          currentStreak: newStreak,
          bestStreak: newBest,
          lastInteractionDate: now,
        },
        $inc: { totalPoints: bonusPoints },
        $setOnInsert: { userId: uid },
      },
      { upsert: true, new: true },
    );

    const newAchievements = await this.checkAndUnlockAchievements(uid, 'streak', newStreak, updated!.unlockedAchievements);
    return { currentStreak: newStreak, newAchievements };
  }

  private async checkAndUnlockAchievements(
    userId: Types.ObjectId,
    type: string,
    value: number,
    alreadyUnlocked: string[],
  ): Promise<string[]> {
    const relevant = GEO_ACHIEVEMENTS.filter((a) => a.type === type && value >= a.threshold);
    const newOnes = relevant.filter((a) => !alreadyUnlocked.includes(a.identifier));

    if (newOnes.length === 0) return [];

    const identifiers = newOnes.map((a) => a.identifier);
    await this.geoProfileModel.updateOne(
      { userId },
      { $addToSet: { unlockedAchievements: { $each: identifiers } } },
    );

    this.logger.log(`User ${userId} unlocked achievements: ${identifiers.join(', ')}`);
    return identifiers;
  }

  getAllAchievements() {
    return GEO_ACHIEVEMENTS;
  }
}

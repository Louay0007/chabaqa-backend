import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ScoringWeights {
  @Prop({ type: Number, default: 1 })
  postLikeReceived: number;

  @Prop({ type: Number, default: 1 })
  commentLikeReceived: number;

  @Prop({ type: Number, default: 2 })
  postCreated: number;

  @Prop({ type: Number, default: 1 })
  commentCreated: number;

  @Prop({ type: Number, default: 50 })
  courseCompleted: number;

  @Prop({ type: Number, default: 0 })
  challengeTaskApproved: number; // 0 means use task's own points

  @Prop({ type: Number, default: 10 })
  challengeCompleted: number;

  @Prop({ type: Number, default: 2 })
  dailyLoginStreak: number;

  @Prop({ type: Number, default: 15 })
  weeklyStreakBonus: number;
}

export const ScoringWeightsSchema = SchemaFactory.createForClass(ScoringWeights);

@Schema({ _id: false })
export class DailyCaps {
  @Prop({ type: Number, default: 5 })
  postCreated: number;

  @Prop({ type: Number, default: 20 })
  commentCreated: number;

  @Prop({ type: Number, default: 50 })
  postLikeReceived: number;

  @Prop({ type: Number, default: 50 })
  commentLikeReceived: number;
}

export const DailyCapsSchema = SchemaFactory.createForClass(DailyCaps);

@Schema({ _id: false })
export class LevelThreshold {
  @Prop({ type: Number, required: true })
  level: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number, required: true })
  minPoints: number;

  @Prop({ type: String })
  icon?: string;

  @Prop({ type: String })
  color?: string;
}

export const LevelThresholdSchema = SchemaFactory.createForClass(LevelThreshold);

@Schema({ _id: false })
export class UnlockRule {
  @Prop({ type: Number, required: true })
  level: number;

  @Prop({ type: String, required: true, enum: ['course', 'challenge', 'space', 'badge', 'role'] })
  targetType: string;

  @Prop({ type: String })
  targetId?: string;

  @Prop({ type: String })
  description?: string;
}

export const UnlockRuleSchema = SchemaFactory.createForClass(UnlockRule);

export type CommunityGamificationConfigDocument = CommunityGamificationConfig & Document;

@Schema({ timestamps: true, collection: 'community_gamification_configs' })
export class CommunityGamificationConfig {
  @Prop({ type: Types.ObjectId, ref: 'Community', required: true, unique: true })
  communityId: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  @Prop({ type: Boolean, default: true })
  publicLeaderboard: boolean;

  @Prop({ type: ScoringWeightsSchema, default: () => ({}) })
  scoringWeights: ScoringWeights;

  @Prop({ type: DailyCapsSchema, default: () => ({}) })
  dailyCaps: DailyCaps;

  @Prop({ type: [LevelThresholdSchema], default: () => [
    { level: 1, name: 'Newcomer', minPoints: 0, icon: '🌱', color: '#94a3b8' },
    { level: 2, name: 'Contributor', minPoints: 50, icon: '⚡', color: '#60a5fa' },
    { level: 3, name: 'Active Member', minPoints: 150, icon: '🔥', color: '#f59e0b' },
    { level: 4, name: 'Rising Star', minPoints: 400, icon: '⭐', color: '#a855f7' },
    { level: 5, name: 'Community Leader', minPoints: 800, icon: '👑', color: '#ef4444' },
    { level: 6, name: 'Elite', minPoints: 1500, icon: '💎', color: '#06b6d4' },
    { level: 7, name: 'Legend', minPoints: 3000, icon: '🏆', color: '#eab308' },
  ] })
  levelThresholds: LevelThreshold[];

  @Prop({ type: [UnlockRuleSchema], default: [] })
  unlockRules: UnlockRule[];

  @Prop({ type: Number, default: 60 })
  cooldownSeconds: number;

  @Prop({ type: String, default: 'monday' })
  weeklyResetDay: string;

  @Prop({ type: Number, default: 7 })
  weeklyResetHourUTC: number;
}

export const CommunityGamificationConfigSchema = SchemaFactory.createForClass(CommunityGamificationConfig);

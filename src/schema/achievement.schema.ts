import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AchievementDocument = Achievement & Document;

export enum AchievementCriteriaType {
  COUNT_COMPLETED = 'count_completed',
  COUNT_CREATED = 'count_created',
  TIME_SPENT = 'time_spent',
  STREAK_DAYS = 'streak_days',
  POINTS_EARNED = 'points_earned',
  COMMUNITY_JOIN_DATE = 'community_join_date',
}

export interface AchievementCriteria {
  type: AchievementCriteriaType;
  contentType?: string; // 'course', 'challenge', etc.
  count?: number;
  timeMinutes?: number;
  days?: number;
  points?: number;
  monthsSinceJoin?: number;
}

@Schema({ timestamps: true })
export class Achievement {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  icon: string; // URL or icon name

  @Prop({ type: Object, required: true })
  criteria: AchievementCriteria;

  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId; // null for global achievements

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  rarity: 'common' | 'rare' | 'epic' | 'legendary';

  @Prop()
  points: number; // XP points awarded

  @Prop({ type: [String] })
  tags: string[];

  @Prop()
  order: number; // for sorting
}

export const AchievementSchema = SchemaFactory.createForClass(Achievement);
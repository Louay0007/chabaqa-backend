import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GeoUserProfileDocument = GeoUserProfile & Document;

export type GeoDifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

@Schema({ timestamps: true, collection: 'geo_user_profiles' })
export class GeoUserProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'intermediate',
  })
  preferredDifficultyLevel: GeoDifficultyLevel;

  @Prop({ type: Number, default: 0 })
  totalPoints: number;

  @Prop({ type: Number, default: 0 })
  questionsAsked: number;

  @Prop({ type: Number, default: 0 })
  quizzesCompleted: number;

  @Prop({ type: Number, default: 0 })
  imagesShared: number;

  @Prop({ type: Number, default: 0 })
  currentStreak: number;

  @Prop({ type: Number, default: 0 })
  bestStreak: number;

  @Prop({ type: Date })
  lastInteractionDate: Date;

  @Prop({ type: [String], default: [] })
  unlockedAchievements: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const GeoUserProfileSchema = SchemaFactory.createForClass(GeoUserProfile);
GeoUserProfileSchema.index({ userId: 1 }, { unique: true });

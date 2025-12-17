import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserAchievementDocument = UserAchievement & Document;

@Schema({ timestamps: true })
export class UserAchievement {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Achievement', required: true })
  achievementId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
  communityId: Types.ObjectId;

  @Prop({ required: true })
  earnedAt: Date;

  @Prop({ type: Object })
  metadata: Record<string, any>; // e.g., { progressAtEarn: 10, criteriaMet: {...} }

  @Prop({ default: false })
  isPublic: boolean; // show in public profile

  @Prop()
  sharedAt?: Date; // when user shared this achievement
}

export const UserAchievementSchema = SchemaFactory.createForClass(UserAchievement);

// Indexes for efficient queries
UserAchievementSchema.index({ userId: 1, communityId: 1 });
UserAchievementSchema.index({ achievementId: 1 });
UserAchievementSchema.index({ earnedAt: -1 });
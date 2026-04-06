import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityMemberGamificationDocument = CommunityMemberGamification & Document;

@Schema({ timestamps: true, collection: 'community_member_gamifications' })
export class CommunityMemberGamification {
  @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
  communityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  totalPoints: number;

  @Prop({ type: Number, default: 0 })
  weeklyPoints: number;

  @Prop({ type: Number, default: 1 })
  level: number;

  @Prop({ type: String, default: 'Newcomer' })
  levelName: string;

  @Prop({ type: Number, default: 0 })
  streakCurrent: number;

  @Prop({ type: Number, default: 0 })
  streakBest: number;

  @Prop({ type: Date })
  lastActivityDate: Date;

  @Prop({ type: Date })
  lastStreakDate: Date;

  @Prop({ type: Number, default: 0 })
  totalPostsCreated: number;

  @Prop({ type: Number, default: 0 })
  totalCommentsCreated: number;

  @Prop({ type: Number, default: 0 })
  totalLikesReceived: number;

  @Prop({ type: Number, default: 0 })
  totalCoursesCompleted: number;

  @Prop({ type: Number, default: 0 })
  totalChallengesCompleted: number;

  @Prop({ type: Boolean, default: true })
  isPublicProfile: boolean;

  @Prop({ type: Boolean, default: true })
  leaderboardOptIn: boolean;

  // Daily cap tracking (reset daily)
  @Prop({ type: String })
  dailyCapDate: string; // YYYY-MM-DD

  @Prop({ type: Number, default: 0 })
  dailyPostsCreated: number;

  @Prop({ type: Number, default: 0 })
  dailyCommentsCreated: number;

  @Prop({ type: Number, default: 0 })
  dailyLikesReceived: number;
}

export const CommunityMemberGamificationSchema = SchemaFactory.createForClass(CommunityMemberGamification);

CommunityMemberGamificationSchema.index({ communityId: 1, userId: 1 }, { unique: true });
CommunityMemberGamificationSchema.index({ communityId: 1, weeklyPoints: -1 });
CommunityMemberGamificationSchema.index({ communityId: 1, totalPoints: -1 });
CommunityMemberGamificationSchema.index({ communityId: 1, level: -1, totalPoints: -1 });

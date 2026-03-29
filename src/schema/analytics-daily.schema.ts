import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AnalyticsDaily {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ type: String, enum: ['course', 'challenge', 'session', 'post', 'event', 'product', 'resource', 'community', 'subscription'], required: true })
  contentType: string;

  @Prop({ type: String })
  contentId?: string;

  @Prop({ type: String })
  communityId?: string;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: Number, default: 0 })
  views: number;

  @Prop({ type: Number, default: 0 })
  starts: number;

  @Prop({ type: Number, default: 0 })
  completes: number;

  @Prop({ type: Number, default: 0 })
  chapterCompletes: number;

  @Prop({ type: Number, default: 0 })
  likes: number;

  @Prop({ type: Number, default: 0 })
  shares: number;

  @Prop({ type: Number, default: 0 })
  downloads: number;

  @Prop({ type: Number, default: 0 })
  bookmarks: number;

  @Prop({ type: Number, default: 0 })
  avgRating: number;

  @Prop({ type: Number, default: 0 })
  ratingsCount: number;

  @Prop({ type: Number, default: 0 })
  watchTime: number; // seconds

  @Prop({ type: Number, default: 0 })
  uniqueUsers: number;

  // --- Phase 2: Revenue & Progress ---

  @Prop({ type: Number, default: 0 })
  avgProgressPercent: number;

  @Prop({ type: Number, default: 0 })
  revenueAttributed: number;

  @Prop({ type: String })
  currency?: string;

  // --- Phase 2: Geographic ---

  @Prop({ type: Map, of: Number, default: {} })
  countryViews: Map<string, number>;

  // --- Phase 2: Engagement ---

  @Prop({ type: Number, default: 0 })
  comments: number;

  // --- Phase 2: Session Quality ---

  @Prop({ type: Number, default: 0 })
  sessionShowUps: number;

  @Prop({ type: Number, default: 0 })
  sessionNoShows: number;

  @Prop({ type: Number, default: 0 })
  sessionRebookings: number;

  // --- Phase 2: Challenge Streaks ---

  @Prop({ type: Number, default: 0 })
  activeStreaks: number;

  @Prop({ type: Number, default: 0 })
  maxStreakDays: number;

  // --- Phase 2: Email Campaign ---

  @Prop({ type: Number, default: 0 })
  emailSent: number;

  @Prop({ type: Number, default: 0 })
  emailOpened: number;

  @Prop({ type: Number, default: 0 })
  emailClicked: number;

  // --- Phase 2: Affiliate ---

  @Prop({ type: String })
  affiliateCode?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type AnalyticsDailyDocument = AnalyticsDaily & Document;
export const AnalyticsDailySchema = SchemaFactory.createForClass(AnalyticsDaily);

AnalyticsDailySchema.index({ creatorId: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, contentType: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, contentType: 1, contentId: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, communityId: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, affiliateCode: 1, date: -1 }, { sparse: true });



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

  createdAt: Date;
  updatedAt: Date;
}

export type AnalyticsDailyDocument = AnalyticsDaily & Document;
export const AnalyticsDailySchema = SchemaFactory.createForClass(AnalyticsDaily);

AnalyticsDailySchema.index({ creatorId: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, contentType: 1, contentId: 1, date: -1 });
AnalyticsDailySchema.index({ creatorId: 1, communityId: 1, date: -1 });



import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PageViewDocument = PageView & Document;

@Schema({ timestamps: true, collection: 'page_views' })
export class PageView {
  @Prop({ required: true, type: Types.ObjectId, ref: 'LandingPage', index: true })
  landingPage: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', index: true })
  communityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LandingPage', index: true })
  homePageId?: Types.ObjectId;

  @Prop({ type: String, enum: ['standalone', 'community-home', 'funnel-step'], default: 'standalone' })
  pageType: string;

  @Prop({ required: true, trim: true })
  sessionId: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ trim: true })
  referrer?: string;

  @Prop({ type: String, enum: ['desktop', 'tablet', 'mobile'], default: 'desktop' })
  device: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  duration: number;

  @Prop({ type: Boolean, default: false })
  converted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PageViewSchema = SchemaFactory.createForClass(PageView);
PageViewSchema.index({ landingPage: 1, createdAt: -1 });
PageViewSchema.index({ sessionId: 1 });
PageViewSchema.index({ landingPage: 1, device: 1 });
PageViewSchema.index({ communityId: 1, createdAt: -1 });
PageViewSchema.index({ homePageId: 1, createdAt: -1 });
PageViewSchema.index({ pageType: 1, createdAt: -1 });
// TTL: auto-delete raw page_views after 365 days
PageViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

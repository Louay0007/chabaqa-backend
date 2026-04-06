import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LandingPageDocument = LandingPage & Document;

@Schema({ timestamps: true, collection: 'landing_pages' })
export class LandingPage {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  creator: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['standalone', 'community-home', 'funnel-step'],
    default: 'standalone',
  })
  pageType: string;

  @Prop({ type: Boolean, default: false })
  isPrimaryHome: boolean;

  @Prop({ required: true, trim: true, minlength: 2, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true,
  })
  status: string;

  @Prop({ type: [{ type: Object }], default: [] })
  blocks: Record<string, any>[];

  @Prop({
    type: {
      title: String,
      description: String,
      keywords: [String],
      ogImage: String,
      ogTitle: String,
      ogDescription: String,
      noIndex: { type: Boolean, default: false },
    },
    default: {},
  })
  seo: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string;
    ogTitle?: string;
    ogDescription?: string;
    noIndex?: boolean;
  };

  @Prop({ trim: true })
  customDomain?: string;

  @Prop({ trim: true })
  favicon?: string;

  @Prop({ trim: true })
  thumbnail?: string;

  @Prop({
    type: {
      passwordProtected: { type: Boolean, default: false },
      password: String,
      trackingPixels: { meta: String, google: String },
    },
    default: {},
  })
  settings: {
    passwordProtected?: boolean;
    password?: string;
    trackingPixels?: { meta?: string; google?: string };
  };

  @Prop()
  publishedAt?: Date;

  @Prop({
    type: {
      views: { type: Number, default: 0 },
      uniqueVisitors: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      avgTimeOnPage: { type: Number, default: 0 },
      bounceRate: { type: Number, default: 0 },
    },
    default: {
      views: 0,
      uniqueVisitors: 0,
      conversions: 0,
      conversionRate: 0,
      avgTimeOnPage: 0,
      bounceRate: 0,
    },
  })
  analytics: {
    views: number;
    uniqueVisitors: number;
    conversions: number;
    conversionRate: number;
    avgTimeOnPage: number;
    bounceRate: number;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const LandingPageSchema = SchemaFactory.createForClass(LandingPage);

// Compound unique index: one slug per creator
LandingPageSchema.index({ creator: 1, slug: 1 }, { unique: true });
LandingPageSchema.index({ creator: 1, status: 1 });
LandingPageSchema.index({ customDomain: 1 }, { sparse: true, unique: true });
LandingPageSchema.index({ createdAt: -1 });

// Community home page indexes
LandingPageSchema.index({ communityId: 1, pageType: 1 });
LandingPageSchema.index(
  { communityId: 1, isPrimaryHome: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isPrimaryHome: true,
      communityId: { $exists: true },
    },
  },
);

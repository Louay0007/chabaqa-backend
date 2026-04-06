import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ required: true, type: Types.ObjectId, ref: 'LandingPage', index: true })
  landingPage!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  creator!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', index: true })
  communityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LandingPage', index: true })
  homePageId?: Types.ObjectId;

  @Prop({ type: String, enum: ['standalone', 'community-home', 'funnel-step'], default: 'standalone' })
  pageType!: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: Object, required: true })
  data!: Record<string, any>;

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  score!: number;

  @Prop({ trim: true })
  source?: string;

  @Prop({ type: String, enum: ['new', 'contacted', 'converted'], default: 'new', index: true })
  status!: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ landingPage: 1, createdAt: -1 });
LeadSchema.index({ creator: 1, createdAt: -1 });
LeadSchema.index({ email: 1, landingPage: 1 });
LeadSchema.index({ communityId: 1, createdAt: -1 });
LeadSchema.index({ homePageId: 1, createdAt: -1 });
LeadSchema.index({ pageType: 1, createdAt: -1 });

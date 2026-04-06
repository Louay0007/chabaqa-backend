import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FunnelDocument = Funnel & Document;

@Schema({ timestamps: true, collection: 'funnels' })
export class Funnel {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  creator: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 2, maxlength: 200 })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft', index: true })
  status: string;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        type: { type: String, required: true },
        title: { type: String, required: true },
        pageId: { type: Types.ObjectId, ref: 'LandingPage' },
        order: { type: Number, required: true },
        stepType: {
          type: String,
          enum: ['landing', 'checkout', 'upsell', 'downsell', 'thank-you', 'webinar', 'opt-in'],
        },
        conversionRate: Number,
        visitors: Number,
        conversions: Number,
      },
    ],
    default: [],
  })
  steps: Array<{
    id: string;
    type: string;
    title: string;
    pageId?: Types.ObjectId;
    order: number;
    stepType?: string;
    conversionRate?: number;
    visitors?: number;
    conversions?: number;
  }>;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        fromStepId: { type: String, required: true },
        toStepId: { type: String, required: true },
        condition: String,
        label: String,
      },
    ],
    default: [],
  })
  connections: Array<{
    id: string;
    fromStepId: string;
    toStepId: string;
    condition?: string;
    label?: string;
  }>;

  @Prop({
    type: {
      totalVisitors: { type: Number, default: 0 },
      totalConversions: { type: Number, default: 0 },
      overallConversionRate: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },
    default: { totalVisitors: 0, totalConversions: 0, overallConversionRate: 0, revenue: 0 },
  })
  analytics: {
    totalVisitors: number;
    totalConversions: number;
    overallConversionRate: number;
    revenue: number;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const FunnelSchema = SchemaFactory.createForClass(Funnel);

FunnelSchema.index({ creator: 1, status: 1 });
FunnelSchema.index({ createdAt: -1 });

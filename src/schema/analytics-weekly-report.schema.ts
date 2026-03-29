import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AnalyticsWeeklyReport {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  weekStart: Date;

  @Prop({ type: String, enum: ['starter', 'growth', 'pro', 'enterprise'], default: 'starter' })
  plan: string;

  @Prop({ type: String })
  summary: string;

  @Prop({ type: [Object], default: [] })
  topIssues: Array<{ stepId: string; stepTitle: string; metricEvidence: string[]; hypothesis: string }>;

  @Prop({ type: [Object], default: [] })
  fixes: Array<{ title: string; whyItHelps: string; exactCreatorAction: string }>;

  @Prop({ type: [Object], default: [] })
  highlights: Array<{ metric: string; value: number; change: number }>;

  @Prop({ type: Date })
  deliveredAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type AnalyticsWeeklyReportDocument = AnalyticsWeeklyReport & Document;
export const AnalyticsWeeklyReportSchema = SchemaFactory.createForClass(AnalyticsWeeklyReport);

AnalyticsWeeklyReportSchema.index({ creatorId: 1, weekStart: -1 }, { unique: true });

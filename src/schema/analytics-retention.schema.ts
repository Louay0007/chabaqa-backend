import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AnalyticsRetention {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ type: String, enum: ['weekly', 'monthly'], required: true })
  period: string;

  @Prop({ type: Date, required: true })
  cohortStart: Date;

  @Prop({ type: Number, required: true })
  week: number;

  @Prop({ type: Number, default: 0 })
  cohortSize: number;

  @Prop({ type: Number, default: 0 })
  retained: number;

  @Prop({ type: Number, default: 0 })
  retentionRate: number;

  @Prop({ type: String })
  communityId?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type AnalyticsRetentionDocument = AnalyticsRetention & Document;
export const AnalyticsRetentionSchema = SchemaFactory.createForClass(AnalyticsRetention);

AnalyticsRetentionSchema.index({ creatorId: 1, period: 1, cohortStart: -1 });
AnalyticsRetentionSchema.index({ creatorId: 1, communityId: 1, period: 1, cohortStart: -1 });

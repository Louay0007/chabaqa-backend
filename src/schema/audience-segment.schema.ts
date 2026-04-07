import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SegmentFilterField {
  INACTIVITY_DAYS = 'inactivity_days',
  PURCHASE_COUNT = 'purchase_count',
  TAG = 'tag',
  EMAIL_OPEN_RATE = 'email_open_rate',
  LOGIN_COUNT = 'login_count',
  JOINED_DAYS_AGO = 'joined_days_ago',
  LEAD_SCORE = 'lead_score',
}

export enum SegmentFilterOperator {
  GT = 'gt',
  LT = 'lt',
  EQ = 'eq',
  GTE = 'gte',
  LTE = 'lte',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
}

@Schema({ _id: false })
export class SegmentFilter {
  @Prop({ type: String, enum: SegmentFilterField, required: true })
  field: SegmentFilterField;

  @Prop({ type: String, enum: SegmentFilterOperator, required: true })
  operator: SegmentFilterOperator;

  @Prop({ type: Object, required: true })
  value: any;
}

export const SegmentFilterSchema = SchemaFactory.createForClass(SegmentFilter);

@Schema({ timestamps: true })
export class AudienceSegment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [SegmentFilterSchema], default: [] })
  filters: SegmentFilter[];

  @Prop({ default: 0 })
  estimatedSize: number;

  @Prop()
  lastCalculatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface AudienceSegmentDocument extends AudienceSegment, Document {}

export const AudienceSegmentSchema = SchemaFactory.createForClass(AudienceSegment);

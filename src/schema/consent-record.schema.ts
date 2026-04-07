import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ConsentType {
  TERMS = 'terms',
  PRIVACY = 'privacy',
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  COOKIES = 'cookies',
}

export interface ConsentRecordDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  consentType: ConsentType;
  version: string;
  ipAddress: string;
  userAgent: string;
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'consent_records' })
export class ConsentRecord {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ConsentType })
  consentType: ConsentType;

  @Prop({ required: true, default: '1.0' })
  version: string;

  @Prop({ required: false })
  ipAddress: string;

  @Prop({ required: false })
  userAgent: string;

  @Prop({ required: true, default: true })
  granted: boolean;

  @Prop({ required: true, default: () => new Date() })
  grantedAt: Date;

  @Prop({ required: false })
  revokedAt?: Date;

  createdAt: Date;
}

export const ConsentRecordSchema = SchemaFactory.createForClass(ConsentRecord);

ConsentRecordSchema.index({ userId: 1 });
ConsentRecordSchema.index({ userId: 1, consentType: 1 });
ConsentRecordSchema.index({ consentType: 1 });
// GDPR max retention: 7 years = 221068800 seconds
ConsentRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 221068800 });

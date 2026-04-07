import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SuppressionReason {
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
  SPAM_COMPLAINT = 'spam_complaint',
  MANUAL = 'manual',
}

export enum SuppressionSource {
  LINK = 'link',
  API = 'api',
  IMPORT = 'import',
  BOUNCE_WEBHOOK = 'bounce_webhook',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class EmailSuppression {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ type: String, enum: SuppressionReason, required: true })
  reason: SuppressionReason;

  @Prop({ type: String, enum: SuppressionSource, required: true })
  source: SuppressionSource;

  createdAt: Date;
}

export interface EmailSuppressionDocument extends EmailSuppression, Document {}

export const EmailSuppressionSchema = SchemaFactory.createForClass(EmailSuppression);

EmailSuppressionSchema.index({ communityId: 1, email: 1 }, { unique: true });

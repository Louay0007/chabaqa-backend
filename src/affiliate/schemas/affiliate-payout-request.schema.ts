import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AffiliatePayoutRequestDocument = AffiliatePayoutRequest & Document;

export type AffiliatePayoutMethod = 'bank_transfer' | 'paypal' | 'stripe';
export type AffiliatePayoutStatus = 'pending' | 'approved' | 'paid' | 'failed' | 'cancelled';

@Schema({ timestamps: true })
export class AffiliatePayoutRequest {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  partnerUserId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amountDT: number;

  @Prop({ type: String, default: 'TND' })
  currency: string;

  @Prop({ type: String, enum: ['bank_transfer', 'paypal', 'stripe'], required: true })
  method: AffiliatePayoutMethod;

  @Prop({ type: String, enum: ['pending', 'approved', 'paid', 'failed', 'cancelled'], default: 'pending' })
  status: AffiliatePayoutStatus;

  @Prop({ type: String, required: true })
  reference: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ type: Date, default: Date.now })
  requestedAt: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: String })
  adminNotes?: string;
}

export const AffiliatePayoutRequestSchema = SchemaFactory.createForClass(AffiliatePayoutRequest);
AffiliatePayoutRequestSchema.index({ partnerUserId: 1, createdAt: -1 });
AffiliatePayoutRequestSchema.index({ status: 1, createdAt: -1 });
AffiliatePayoutRequestSchema.index({ reference: 1 }, { unique: true });

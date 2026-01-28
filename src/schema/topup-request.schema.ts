import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TopUpRequestDocument = TopUpRequest & Document;

/**
 * Status of a top-up request
 */
export enum TopUpRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * Original currency used for the top-up
 */
export enum TopUpCurrency {
  DT = 'DT',   // Tunisian Dinar
  USD = 'USD', // US Dollar
  EUR = 'EUR', // Euro
}

@Schema({ timestamps: true })
export class TopUpRequest {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Amount in original currency
  @Prop({ type: Number, required: true })
  originalAmount: number;

  @Prop({ type: String, enum: TopUpCurrency, required: true })
  originalCurrency: TopUpCurrency;

  // Conversion rate used (1 DT = X original currency)
  @Prop({ type: Number, required: true })
  conversionRate: number;

  // Final amount in DT (points)
  @Prop({ type: Number, required: true })
  amountDT: number;

  @Prop({ type: String, enum: TopUpRequestStatus, default: TopUpRequestStatus.PENDING })
  status: TopUpRequestStatus;

  // Payment proof image URL
  @Prop({ type: String, required: true })
  paymentProof: string;

  // User notes
  @Prop({ type: String })
  userNotes?: string;

  // Admin who processed the request
  @Prop({ type: Types.ObjectId, ref: 'User' })
  processedBy?: Types.ObjectId;

  // Admin notes (reason for rejection, etc.)
  @Prop({ type: String })
  adminNotes?: string;

  // When the request was processed
  @Prop({ type: Date })
  processedAt?: Date;

  // Unique reference for tracking
  @Prop({ type: String, required: true })
  reference: string;
}

export const TopUpRequestSchema = SchemaFactory.createForClass(TopUpRequest);

// Indexes
TopUpRequestSchema.index({ userId: 1, createdAt: -1 });
TopUpRequestSchema.index({ status: 1, createdAt: -1 });
TopUpRequestSchema.index({ reference: 1 }, { unique: true });
TopUpRequestSchema.index({ processedBy: 1 });

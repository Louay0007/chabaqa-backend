import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PayoutDocument = Payout & Document;

export enum PayoutStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  SCHEDULED = 'scheduled'
}

export enum PayoutMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
  STRIPE = 'stripe'
}

@Schema({ timestamps: true })
export class Payout {
  _id: Types.ObjectId;

  // Creator who receives the payout
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  // Amount in the smallest currency unit (e.g., cents for USD)
  @Prop({ type: Number, required: true })
  amount: number;

  // Currency code (e.g., USD, TND)
  @Prop({ type: String, default: 'TND' })
  currency: string;

  // Status of the payout
  @Prop({ 
    type: String, 
    enum: Object.values(PayoutStatus), 
    default: PayoutStatus.PENDING 
  })
  status: PayoutStatus;

  // Payment method used
  @Prop({ 
    type: String, 
    enum: Object.values(PayoutMethod), 
    required: true 
  })
  method: PayoutMethod;

  // Reference ID for tracking
  @Prop({ type: String, required: true, unique: true })
  reference: string;

  // Number of items/revenue sources included in this payout
  @Prop({ type: Number, default: 0 })
  itemsCount: number;

  // Optional notes or description
  @Prop()
  description?: string;

  // Metadata for different payment methods
  @Prop({ type: Object })
  metadata?: {
    // Bank transfer details
    bankAccount?: {
      accountNumber?: string;
      iban?: string;
      bankName?: string;
      swiftCode?: string;
    };
    // PayPal details
    paypalEmail?: string;
    // Stripe details
    stripeAccountId?: string;
    stripePayoutId?: string;
  };

  // When the payout was requested
  @Prop({ type: Date, default: Date.now })
  requestedAt: Date;

  // When the payout was actually processed/completed
  @Prop()
  processedAt?: Date;

  // Optional: Scheduled payout date
  @Prop()
  scheduledFor?: Date;

  // Admin notes (internal use)
  @Prop()
  adminNotes?: string;

  // Whether this payout has been exported/accounted for
  @Prop({ type: Boolean, default: false })
  exported: boolean;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

// Indexes for efficient querying
PayoutSchema.index({ creatorId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1 });
PayoutSchema.index({ method: 1 });
PayoutSchema.index({ reference: 1 }, { unique: true });
PayoutSchema.index({ requestedAt: 1 });
PayoutSchema.index({ processedAt: 1 });
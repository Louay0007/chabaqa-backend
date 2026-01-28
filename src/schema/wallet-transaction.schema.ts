import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

/**
 * Transaction types for wallet operations
 */
export enum WalletTransactionType {
  TOPUP = 'topup',           // Adding money to wallet
  PURCHASE = 'purchase',      // Buying content
  REFUND = 'refund',         // Refund from cancelled order
  TRANSFER = 'transfer',      // Transfer to another user (future)
  WITHDRAWAL = 'withdrawal',  // Withdraw to bank (future)
}

/**
 * Content types that can be purchased with wallet
 */
export enum WalletPurchaseContentType {
  COMMUNITY = 'community',
  COURSE = 'course',
  CHALLENGE = 'challenge',
  EVENT = 'event',
  PRODUCT = 'product',
  SESSION = 'session',
}

@Schema({ timestamps: true })
export class WalletTransaction {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: WalletTransactionType, required: true })
  type: WalletTransactionType;

  @Prop({ type: Number, required: true })
  amount: number; // Positive for credit, negative for debit

  @Prop({ type: Number, required: true })
  balanceBefore: number;

  @Prop({ type: Number, required: true })
  balanceAfter: number;

  @Prop({ type: String })
  description?: string;

  // For purchases - link to the content
  @Prop({ type: String, enum: WalletPurchaseContentType })
  contentType?: WalletPurchaseContentType;

  @Prop({ type: String })
  contentId?: string;

  // For purchases - link to the order
  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  // For top-ups - link to the top-up request
  @Prop({ type: Types.ObjectId, ref: 'TopUpRequest' })
  topUpRequestId?: Types.ObjectId;

  // Reference number for tracking
  @Prop({ type: String, required: true })
  reference: string;

  @Prop({ type: String, default: 'DT' })
  currency: string;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

// Indexes for efficient queries
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ reference: 1 }, { unique: true });
WalletTransactionSchema.index({ type: 1 });
WalletTransactionSchema.index({ orderId: 1 });
WalletTransactionSchema.index({ topUpRequestId: 1 });

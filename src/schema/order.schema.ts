import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TrackableContentType } from './content-tracking.schema';

export type OrderDocument = Order & Document;

/**
 * Order Schema - Represents a purchase transaction
 * 
 * IMPORTANT: Fee Calculation Model
 * ================================
 * This system uses a FEE DEDUCTION model, NOT a fee addition model.
 * 
 * Example: Customer buys a 50 DT course with 7.9% platform fee
 *   - amountDT: 50 DT (what customer pays - EXACTLY what they see)
 *   - platformFeeDT: 3.95 DT (50 × 0.079)
 *   - creatorNetDT: 46.05 DT (50 - 3.95)
 * 
 * The customer NEVER pays more than amountDT. The platform fee is deducted
 * from the payment, reducing what the creator receives.
 * 
 * Formula: creatorNetDT = amountDT - platformFeeDT
 */
@Schema({ timestamps: true })
export class Order {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  buyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  // Optional: ties order to a community for community-related purchases
  @Prop({ type: Types.ObjectId, ref: 'Community' })
  communityId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TrackableContentType), required: true })
  contentType: TrackableContentType;

  @Prop({ type: String, required: true })
  contentId: string;

  /** Total amount paid by the customer (in Tunisian Dinars) */
  @Prop({ type: Number, required: true })
  amountDT: number;

  /** Platform fee percentage applied (e.g., 7.9 for 7.9%) */
  @Prop({ type: Number, required: true })
  platformPercent: number;

  /** Fixed platform fee in DT (usually 0) */
  @Prop({ type: Number, required: true })
  platformFixedDT: number;

  /** Total platform fee deducted: (amountDT × platformPercent / 100) + platformFixedDT */
  @Prop({ type: Number, required: true })
  platformFeeDT: number;

  /** Net amount the creator receives: amountDT - platformFeeDT */
  @Prop({ type: Number, required: true })
  creatorNetDT: number;

  @Prop({ type: String, uppercase: true, default: null })
  promoCode?: string | null;

  /** Discount amount from promo code (already applied to amountDT) */
  @Prop({ type: Number, default: 0 })
  discountDT?: number;

  @Prop({ type: String })
  paymentId?: string;

  @Prop({ type: String })
  paymentMethod?: string; // e.g. 'flouci', 'stripe', 'manual', 'offline'

  @Prop({ type: String, default: 'pending' })
  status: 'paid' | 'refunded' | 'pending' | 'pending_verification' | 'cancelled';

  @Prop({ type: String })
  paymentProof?: string; // URL of the uploaded proof file

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ creatorId: 1, createdAt: -1 });
OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ contentType: 1, contentId: 1 });
OrderSchema.index({ paymentId: 1 }, { unique: true, sparse: true });
OrderSchema.index({ communityId: 1 });

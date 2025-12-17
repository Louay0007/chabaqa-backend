import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PlanTier } from './plan.schema';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete'
}

@Schema({ timestamps: true })
export class Subscription {
  _id: Types.ObjectId;

  // Creator user who owns the subscription
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  // Current plan tier
  @Prop({ type: String, enum: Object.values(PlanTier), required: true })
  plan: PlanTier;

  // Stripe/Provider identifiers
  @Prop()
  provider: string; // e.g., 'stripe'

  @Prop()
  providerCustomerId?: string;

  @Prop()
  providerSubscriptionId?: string;

  // Billing and trial periods
  @Prop({ type: Date })
  trialEndsAt?: Date;

  @Prop({ type: Date, required: true })
  currentPeriodStart: Date;

  @Prop({ type: Date, required: true })
  currentPeriodEnd: Date;

  @Prop({ type: String, enum: Object.values(SubscriptionStatus), required: true })
  status: SubscriptionStatus;

  // Cancel at period end
  @Prop({ type: Boolean, default: false })
  cancelAtPeriodEnd: boolean;

  // Soft limits cache (helps fast checks without DB join)
  @Prop({ type: Number, default: 1 })
  communitiesMax: number;

  @Prop({ type: Number, default: 100 })
  membersMax: number;

  @Prop({ type: Number, default: 3 })
  coursesActivationMax: number;

  @Prop({ type: Number, default: 2 })
  storageGB: number;

  @Prop({ type: Number, default: 0 })
  adminsMax: number;

  // Billing method presence (card/mandate set up with provider)
  @Prop({ type: Boolean, default: false })
  hasPaymentMethod: boolean;

  // Optional masked info for display
  @Prop()
  paymentBrand?: string; // e.g., VISA

  @Prop()
  paymentLast4?: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ creatorId: 1 }, { unique: true });



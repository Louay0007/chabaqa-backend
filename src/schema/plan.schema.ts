import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanDocument = Plan & Document;

export enum PlanTier {
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

@Schema({ _id: false })
export class PlanLimits {
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

  @Prop({ type: Number, default: 0 })
  emailCampaignRecipientsPerMonth: number;

  @Prop({ type: Number, default: 0 })
  whatsappMessagesPerMonth: number;

  @Prop({ type: Number, default: 30 })
  analyticsLookbackDays: number;

  @Prop({ type: Number, default: 0 })
  sessionBookingsPerMonth: number;
}

export const PlanLimitsSchema = SchemaFactory.createForClass(PlanLimits);

@Schema({ _id: false })
export class PlanFeatures {
  @Prop({ type: Boolean, default: true })
  courses: boolean;

  @Prop({ type: Boolean, default: false })
  challenges: boolean;

  @Prop({ type: Boolean, default: false })
  sessions: boolean;

  @Prop({ type: Boolean, default: true })
  products: boolean;

  @Prop({ type: Boolean, default: false })
  events: boolean;

  @Prop({ type: Number, default: 0 })
  automationQuota: number;

  @Prop({ type: Boolean, default: false })
  branding: boolean;

  @Prop({ type: Boolean, default: false })
  gamification: boolean;

  @Prop({ type: Boolean, default: false })
  verifiedBadge: boolean;

  @Prop({ type: Boolean, default: false })
  featuredBadge: boolean;
}

export const PlanFeaturesSchema = SchemaFactory.createForClass(PlanFeatures);

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, type: String, enum: PlanTier, unique: true })
  tier: PlanTier;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true })
  priceDTPerMonth: number;

  /** Per-month price when billed yearly (~20% discount) */
  @Prop({ type: Number, default: 0 })
  yearlyPriceDTPerMonth: number;

  /** Total annual price (yearlyPriceDTPerMonth × 12) */
  @Prop({ type: Number, default: 0 })
  yearlyTotalDT: number;

  @Prop({ type: Number, default: 7 })
  trialDays: number;

  @Prop({ type: PlanLimitsSchema, default: {} })
  limits: PlanLimits;

  @Prop({ type: PlanFeaturesSchema, default: {} })
  features: PlanFeatures;

  @Prop({ type: Number, required: true })
  transactionFeePercent: number;

  @Prop({ type: Number, required: true })
  transactionFixedFeeDT: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);



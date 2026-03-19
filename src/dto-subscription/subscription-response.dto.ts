import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../schema/subscription.schema';
import { PlanTier, PlanLimits, PlanFeatures } from '../schema/plan.schema';

export class SubscriptionResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  creatorId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439099' })
  subscriberId: string;

  @ApiPropertyOptional({ example: 'customer@example.com' })
  subscriberEmail?: string;

  @ApiProperty({ enum: PlanTier, example: PlanTier.STARTER })
  plan: string;

  @ApiProperty({ example: 'stripe' })
  provider: string;

  @ApiPropertyOptional({ example: 'cus_123456789' })
  providerCustomerId?: string;

  @ApiPropertyOptional({ example: 'sub_123456789' })
  providerSubscriptionId?: string;

  @ApiPropertyOptional({ example: '2024-07-15T00:00:00.000Z' })
  trialEndsAt?: Date;

  @ApiProperty({ example: '2024-01-15T00:00:00.000Z' })
  currentPeriodStart: Date;

  @ApiProperty({ example: '2024-02-15T00:00:00.000Z' })
  currentPeriodEnd: Date;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: string;

  @ApiProperty({ example: false })
  cancelAtPeriodEnd: boolean;

  @ApiProperty({ example: 5 })
  communitiesMax: number;

  @ApiProperty({ example: 1000 })
  membersMax: number;

  @ApiProperty({ example: 10 })
  coursesActivationMax: number;

  @ApiProperty({ example: 10 })
  storageGB: number;

  @ApiProperty({ example: 5 })
  adminsMax: number;

  @ApiProperty({ example: true })
  hasPaymentMethod: boolean;

  @ApiPropertyOptional({ example: 'visa' })
  paymentBrand?: string;

  @ApiPropertyOptional({ example: '1234' })
  paymentLast4?: string;

  @ApiProperty({ example: 29.99 })
  amount: number;

  @ApiProperty({ example: 'TND' })
  currency: string;

  @ApiPropertyOptional({ example: '2024-03-15T00:00:00.000Z' })
  nextBillingAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class SubscriptionStatsDto {
  @ApiProperty({ example: 1248 })
  totalSubscribers: number;

  @ApiProperty({ example: 1186 })
  activeSubscribers: number;

  @ApiProperty({ example: 24860 })
  monthlyRevenue: number;

  @ApiProperty({ example: 21.42 })
  averageSubscriptionValue: number;

  @ApiProperty({ example: 50 })
  trialSubscribers: number;

  @ApiProperty({ example: 12 })
  canceledSubscribers: number;

  @ApiProperty({ example: 8 })
  pastDueSubscribers: number;
}

export class SubscriptionPlanDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.STARTER })
  tier: string;

  @ApiProperty({ example: 'Starter Plan' })
  name: string;

  @ApiProperty({ example: 29.99 })
  priceDTPerMonth: number;

  @ApiProperty({ example: 7 })
  trialDays: number;

  @ApiProperty({ type: Object })
  limits: PlanLimits;

  @ApiProperty({ type: Object })
  features: PlanFeatures;

  @ApiProperty({ example: 2.9 })
  transactionFeePercent: number;

  @ApiProperty({ example: 0.3 })
  transactionFixedFeeDT: number;

  @ApiProperty({ example: true })
  isActive: boolean;
}
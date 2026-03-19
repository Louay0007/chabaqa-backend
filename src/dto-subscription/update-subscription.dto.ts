import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsBoolean, Min, Max, IsEmail } from 'class-validator';
import { PlanTier } from '../schema/plan.schema';
import { SubscriptionStatus } from '../schema/subscription.schema';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ 
    description: 'Plan tier',
    enum: PlanTier
  })
  @IsOptional()
  @IsEnum(PlanTier)
  plan?: string;

  @ApiPropertyOptional({ 
    description: 'Amount in TND',
    example: 29.99,
    minimum: 0.01
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ 
    description: 'Currency code',
    example: 'TND'
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ 
    description: 'Payment provider',
    example: 'stripe',
    enum: ['stripe', 'paypal', 'custom']
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ 
    description: 'Provider customer ID',
    example: 'cus_123456789'
  })
  @IsOptional()
  @IsString()
  providerCustomerId?: string;

  @ApiPropertyOptional({ 
    description: 'Provider subscription ID',
    example: 'sub_123456789'
  })
  @IsOptional()
  @IsString()
  providerSubscriptionId?: string;

  @ApiPropertyOptional({ 
    description: 'Trial end date',
    example: '2024-07-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @ApiPropertyOptional({ 
    description: 'Current period start date',
    example: '2024-01-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  @ApiPropertyOptional({ 
    description: 'Current period end date',
    example: '2024-02-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional({ 
    description: 'Subscription status',
    enum: SubscriptionStatus
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: string;

  @ApiPropertyOptional({ 
    description: 'Cancel at period end',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({ 
    description: 'Has payment method configured',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  hasPaymentMethod?: boolean;

  @ApiPropertyOptional({ 
    description: 'Payment method brand (e.g., visa, mastercard)',
    example: 'visa'
  })
  @IsOptional()
  @IsString()
  paymentBrand?: string;

  @ApiPropertyOptional({ 
    description: 'Last 4 digits of payment method',
    example: '1234'
  })
  @IsOptional()
  @IsString()
  paymentLast4?: string;

  @ApiPropertyOptional({ 
    description: 'Communities limit',
    example: 5,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  communitiesMax?: number;

  @ApiPropertyOptional({ 
    description: 'Members limit',
    example: 1000,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  membersMax?: number;

  @ApiPropertyOptional({ 
    description: 'Courses activation limit',
    example: 10,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  coursesActivationMax?: number;

  @ApiPropertyOptional({ 
    description: 'Storage limit in GB',
    example: 10,
    minimum: 0
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  storageGB?: number;

  @ApiPropertyOptional({ 
    description: 'Admins limit',
    example: 5,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  adminsMax?: number;

  // Customer billing information updates
  @ApiPropertyOptional({ 
    description: 'Customer email for billing',
    example: 'customer@example.com'
  })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ 
    description: 'Customer name',
    example: 'John Doe'
  })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ 
    description: 'Customer phone number',
    example: '+21612345678'
  })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  // Billing address updates
  @ApiPropertyOptional({ 
    description: 'Billing address line 1',
    example: '123 Main Street'
  })
  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Billing address line 2',
    example: 'Apartment 4B'
  })
  @IsOptional()
  @IsString()
  billingAddressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'Billing city',
    example: 'Tunis'
  })
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiPropertyOptional({ 
    description: 'Billing state/province',
    example: 'Tunis'
  })
  @IsOptional()
  @IsString()
  billingState?: string;

  @ApiPropertyOptional({ 
    description: 'Billing postal code',
    example: '1000'
  })
  @IsOptional()
  @IsString()
  billingPostalCode?: string;

  @ApiPropertyOptional({ 
    description: 'Billing country',
    example: 'TN'
  })
  @IsOptional()
  @IsString()
  billingCountry?: string;

  // Discount/Coupon updates
  @ApiPropertyOptional({ 
    description: 'Discount coupon code',
    example: 'SAVE20'
  })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ 
    description: 'Discount percentage (0-100)',
    example: 20,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  // Subscription notes
  @ApiPropertyOptional({ 
    description: 'Internal notes about the subscription',
    example: 'Customer requested plan downgrade'
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
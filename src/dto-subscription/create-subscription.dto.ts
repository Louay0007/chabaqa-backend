import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsBoolean, Min, Max, IsEmail } from 'class-validator';
import { PlanTier } from '../schema/plan.schema';
import { SubscriptionStatus } from '../schema/subscription.schema';

export class CreateSubscriptionDto {
  @ApiProperty({ 
    description: 'Plan tier to subscribe to',
    enum: PlanTier,
    example: PlanTier.STARTER
  })
  @IsEnum(PlanTier)
  plan: string;

  @ApiProperty({ 
    description: 'Amount to charge in TND',
    example: 29.99,
    minimum: 0.01
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ 
    description: 'Currency code',
    example: 'TND',
    default: 'TND'
  })
  @IsOptional()
  @IsString()
  currency?: string = 'TND';

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

  @ApiProperty({ 
    description: 'Current period start date',
    example: '2024-01-15T00:00:00.000Z'
  })
  @IsDateString()
  currentPeriodStart: string;

  @ApiProperty({ 
    description: 'Current period end date',
    example: '2024-02-15T00:00:00.000Z'
  })
  @IsDateString()
  currentPeriodEnd: string;

  @ApiProperty({ 
    description: 'Subscription status',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE
  })
  @IsEnum(SubscriptionStatus)
  status: string;

  @ApiPropertyOptional({ 
    description: 'Cancel at period end',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean = false;

  @ApiPropertyOptional({ 
    description: 'Has payment method configured',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  hasPaymentMethod?: boolean = false;

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

  // Customer billing information
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

  // Billing address
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
    example: 'TN',
    default: 'TN'
  })
  @IsOptional()
  @IsString()
  billingCountry?: string = 'TN';

  // Discount/Coupon
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
}
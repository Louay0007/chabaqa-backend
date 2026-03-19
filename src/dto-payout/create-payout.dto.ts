import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { PayoutStatus, PayoutMethod } from '../schema/payout.schema';

export class CreatePayoutDto {
  @ApiProperty({ 
    description: 'Amount to payout',
    example: 1000
  })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ 
    description: 'Currency code',
    example: 'TND',
    default: 'TND'
  })
  @IsOptional()
  @IsString()
  currency?: string = 'TND';

  @ApiProperty({ 
    description: 'Payout method',
    enum: PayoutMethod,
    example: PayoutMethod.BANK_TRANSFER
  })
  @IsEnum(PayoutMethod)
  method: string;

  @ApiPropertyOptional({ 
    description: 'Description of the payout',
    example: 'Monthly earnings'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Scheduled date for payout',
    example: '2024-07-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiPropertyOptional({ 
    description: 'Number of items included in this payout',
    example: 10
  })
  @IsOptional()
  @IsNumber()
  itemsCount?: number;

  @ApiPropertyOptional({ 
    description: 'Additional metadata for the payout'
  })
  @IsOptional()
  metadata?: any;

  @ApiPropertyOptional({ 
    description: 'Bank account details for bank transfer',
    example: {
      accountNumber: '123456789',
      iban: 'TN5910006035183598478831',
      bankName: 'Attijari Bank',
      swiftCode: 'ATTIJERTUN'
    }
  })
  @IsOptional()
  bankAccount?: {
    accountNumber?: string;
    iban?: string;
    bankName?: string;
    swiftCode?: string;
  };

  @ApiPropertyOptional({ 
    description: 'PayPal email for PayPal payouts',
    example: 'creator@example.com'
  })
  @IsOptional()
  @IsString()
  paypalEmail?: string;

  @ApiPropertyOptional({ 
    description: 'Stripe account ID for Stripe payouts',
    example: 'acct_123456789'
  })
  @IsOptional()
  @IsString()
  stripeAccountId?: string;
}
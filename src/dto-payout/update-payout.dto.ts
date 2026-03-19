import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { PayoutStatus, PayoutMethod } from '../schema/payout.schema';

export class UpdatePayoutDto {
  @ApiPropertyOptional({ 
    description: 'Payout status',
    enum: PayoutStatus
  })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: string;

  @ApiPropertyOptional({ 
    description: 'Amount',
    example: 1000
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ 
    description: 'Currency code',
    example: 'TND'
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ 
    description: 'Payout method',
    enum: PayoutMethod
  })
  @IsOptional()
  @IsEnum(PayoutMethod)
  method?: string;

  @ApiPropertyOptional({ 
    description: 'Description',
    example: 'Updated payout description'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Scheduled date',
    example: '2024-07-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiPropertyOptional({ 
    description: 'Processed date',
    example: '2024-07-15T10:30:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  processedAt?: string;

  @ApiPropertyOptional({ 
    description: 'Admin notes',
    example: 'Payout processed successfully'
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;

  @ApiPropertyOptional({ 
    description: 'Whether this payout has been exported',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  exported?: boolean;

  @ApiPropertyOptional({ 
    description: 'Bank account details',
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
    description: 'PayPal email',
    example: 'creator@example.com'
  })
  @IsOptional()
  @IsString()
  paypalEmail?: string;

  @ApiPropertyOptional({ 
    description: 'Stripe account ID',
    example: 'acct_123456789'
  })
  @IsOptional()
  @IsString()
  stripeAccountId?: string;

  @ApiPropertyOptional({ 
    description: 'Stripe payout ID',
    example: 'po_123456789'
  })
  @IsOptional()
  @IsString()
  stripePayoutId?: string;
}
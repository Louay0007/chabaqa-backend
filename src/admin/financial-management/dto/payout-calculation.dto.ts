import { IsNotEmpty, IsString, IsNumber, Min, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutMethod } from '../../../schema/payout.schema';

export class CalculatePayoutDto {
  @ApiProperty({ description: 'Community ID for payout calculation' })
  @IsNotEmpty()
  @IsString()
  communityId: string;

  @ApiProperty({ description: 'Creator ID receiving the payout' })
  @IsNotEmpty()
  @IsString()
  creatorId: string;

  @ApiPropertyOptional({ description: 'Start date for revenue calculation' })
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date for revenue calculation' })
  @IsOptional()
  endDate?: Date;
}

export class InitiatePayoutDto {
  @ApiProperty({ description: 'Community ID for the payout' })
  @IsNotEmpty()
  @IsString()
  communityId: string;

  @ApiProperty({ description: 'Creator ID receiving the payout' })
  @IsNotEmpty()
  @IsString()
  creatorId: string;

  @ApiProperty({ description: 'Payout amount (after platform fees)' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: PayoutMethod, description: 'Payment method for the payout' })
  @IsNotEmpty()
  @IsEnum(PayoutMethod)
  method: string;

  @ApiPropertyOptional({ description: 'Optional description for the payout' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Optional admin notes' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class PayoutCalculationResultDto {
  @ApiProperty({ description: 'Total revenue before fees' })
  totalRevenue: number;

  @ApiProperty({ description: 'Platform fee percentage' })
  platformFeePercentage: number;

  @ApiProperty({ description: 'Platform fee amount' })
  platformFeeAmount: number;

  @ApiProperty({ description: 'Net payout amount (after fees)' })
  netPayoutAmount: number;

  @ApiProperty({ description: 'Number of transactions included' })
  transactionCount: number;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Calculation period start date' })
  periodStart: Date;

  @ApiProperty({ description: 'Calculation period end date' })
  periodEnd: Date;
}

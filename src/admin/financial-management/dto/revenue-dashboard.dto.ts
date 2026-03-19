import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TimePeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export class RevenueDashboardQueryDto {
  @ApiPropertyOptional({
    enum: TimePeriod,
    default: TimePeriod.MONTH,
    description: 'Time period for revenue metrics',
  })
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: string = TimePeriod.MONTH;

  @ApiPropertyOptional({
    description: 'Start date for custom period (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for custom period (ISO 8601 format)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class RevenueMetricsDto {
  @ApiProperty({ description: 'Total revenue in the period' })
  totalRevenue: number;

  @ApiProperty({ description: 'Revenue from subscriptions' })
  subscriptionRevenue: number;

  @ApiProperty({ description: 'Revenue from one-time purchases' })
  oneTimeRevenue: number;

  @ApiProperty({ description: 'Platform fees collected' })
  platformFees: number;

  @ApiProperty({ description: 'Creator payouts processed' })
  creatorPayouts: number;

  @ApiProperty({ description: 'Revenue growth rate compared to previous period' })
  growthRate: number;

  @ApiProperty({ description: 'Time period for these metrics' })
  period: string;

  @ApiProperty({ description: 'Start date of the period' })
  startDate: Date;

  @ApiProperty({ description: 'End date of the period' })
  endDate: Date;

  @ApiProperty({ description: 'Number of transactions in the period' })
  transactionCount: number;

  @ApiProperty({ description: 'Average transaction value' })
  averageTransactionValue: number;
}

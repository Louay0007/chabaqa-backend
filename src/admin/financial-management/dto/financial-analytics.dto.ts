import { IsOptional, IsEnum, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimePeriod } from './revenue-dashboard.dto';

export class FinancialAnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: TimePeriod,
    default: TimePeriod.MONTH,
    description: 'Time period for analytics',
  })
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: string = TimePeriod.MONTH;

  @ApiPropertyOptional({
    description: 'Start date for custom period',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for custom period',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Limit the number of results',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class RevenueByContentTypeDto {
  @ApiProperty({ description: 'Revenue from community memberships' })
  community: number;

  @ApiProperty({ description: 'Revenue from courses' })
  course: number;

  @ApiProperty({ description: 'Revenue from events' })
  event: number;

  @ApiProperty({ description: 'Revenue from products' })
  product: number;

  @ApiProperty({ description: 'Revenue from sessions' })
  session: number;

  @ApiProperty({ description: 'Revenue from challenges' })
  challenge: number;
}

export class TopCreatorsDto {
  @ApiProperty({ description: 'Creator ID' })
  creatorId: string;

  @ApiProperty({ description: 'Creator name' })
  creatorName: string;

  @ApiProperty({ description: 'Creator email' })
  creatorEmail: string;

  @ApiProperty({ description: 'Total revenue generated' })
  totalRevenue: number;

  @ApiProperty({ description: 'Number of transactions' })
  transactionCount: number;

  @ApiProperty({ description: 'Average transaction value' })
  averageTransactionValue: number;

  @ApiProperty({ description: 'Total payouts received' })
  totalPayouts: number;
}

export class RevenueGrowthDto {
  @ApiProperty({ description: 'Current period revenue' })
  currentPeriodRevenue: number;

  @ApiProperty({ description: 'Previous period revenue' })
  previousPeriodRevenue: number;

  @ApiProperty({ description: 'Revenue growth rate (percentage)' })
  growthRate: number;

  @ApiProperty({ description: 'Revenue growth amount' })
  growthAmount: number;

  @ApiProperty({ description: 'Period start date' })
  periodStart: Date;

  @ApiProperty({ description: 'Period end date' })
  periodEnd: Date;
}

export class PayoutAnalyticsDto {
  @ApiProperty({ description: 'Total payouts in period' })
  totalPayouts: number;

  @ApiProperty({ description: 'Total payout amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Average payout amount' })
  averagePayoutAmount: number;

  @ApiProperty({ description: 'Largest payout amount' })
  largestPayout: number;

  @ApiProperty({ description: 'Smallest payout amount' })
  smallestPayout: number;

  @ApiProperty({ description: 'Payout completion rate (percentage)' })
  completionRate: number;

  @ApiProperty({ description: 'Average processing time (days)' })
  averageProcessingTime: number;

  @ApiProperty({ description: 'Payouts by method' })
  payoutsByMethod: {
    bank_transfer: number;
    paypal: number;
    stripe: number;
  };
}

export class TransactionAnalyticsDto {
  @ApiProperty({ description: 'Total transactions in period' })
  totalTransactions: number;

  @ApiProperty({ description: 'Total transaction volume' })
  totalVolume: number;

  @ApiProperty({ description: 'Average transaction value' })
  averageValue: number;

  @ApiProperty({ description: 'Largest transaction' })
  largestTransaction: number;

  @ApiProperty({ description: 'Transactions by type' })
  transactionsByType: Record<string, number>;

  @ApiProperty({ description: 'Daily transaction average' })
  dailyAverage: number;

  @ApiProperty({ description: 'Transaction growth rate (percentage)' })
  growthRate: number;
}

export class PlatformFeesAnalyticsDto {
  @ApiProperty({ description: 'Total platform fees collected' })
  totalFees: number;

  @ApiProperty({ description: 'Average fee percentage' })
  averageFeePercentage: number;

  @ApiProperty({ description: 'Fees by content type' })
  feesByContentType: Record<string, number>;

  @ApiProperty({ description: 'Fee growth rate (percentage)' })
  feeGrowthRate: number;

  @ApiProperty({ description: 'Total revenue before fees' })
  totalRevenueBeforeFees: number;
}

export class FinancialHealthDto {
  @ApiProperty({ description: 'Revenue health score (0-100)' })
  revenueHealthScore: number;

  @ApiProperty({ description: 'Payout health score (0-100)' })
  payoutHealthScore: number;

  @ApiProperty({ description: 'Transaction health score (0-100)' })
  transactionHealthScore: number;

  @ApiProperty({ description: 'Overall financial health score (0-100)' })
  overallHealthScore: number;

  @ApiProperty({ description: 'Health indicators' })
  indicators: {
    revenueGrowth: 'positive' | 'negative' | 'stable';
    payoutProcessing: 'healthy' | 'delayed' | 'critical';
    transactionVolume: 'increasing' | 'decreasing' | 'stable';
  };

  @ApiProperty({ description: 'Recommendations' })
  recommendations: string[];
}

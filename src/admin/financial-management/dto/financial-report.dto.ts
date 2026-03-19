import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimePeriod } from './revenue-dashboard.dto';

export enum ReportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
  JSON = 'json',
}

export class GenerateFinancialReportDto {
  @ApiProperty({
    enum: TimePeriod,
    description: 'Time period for the report',
  })
  @IsEnum(TimePeriod)
  period: string;

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

  @ApiProperty({
    enum: ReportFormat,
    default: ReportFormat.PDF,
    description: 'Output format for the report',
  })
  @IsEnum(ReportFormat)
  format: string = ReportFormat.PDF;
}

export class FinancialReportDto {
  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Report period' })
  period: string;

  @ApiProperty({ description: 'Period start date' })
  startDate: Date;

  @ApiProperty({ description: 'Period end date' })
  endDate: Date;

  @ApiProperty({ description: 'Revenue breakdown' })
  revenueBreakdown: {
    totalRevenue: number;
    subscriptionRevenue: number;
    oneTimeRevenue: number;
    revenueByContentType: {
      community: number;
      course: number;
      event: number;
      product: number;
      session: number;
      challenge: number;
    };
  };

  @ApiProperty({ description: 'Payout summary' })
  payoutSummary: {
    totalPayouts: number;
    completedPayouts: number;
    pendingPayouts: number;
    failedPayouts: number;
    payoutsByMethod: {
      bank_transfer: number;
      paypal: number;
      stripe: number;
    };
  };

  @ApiProperty({ description: 'Platform fees collected' })
  platformFees: {
    totalFees: number;
    averageFeePercentage: number;
    feesByContentType: Record<string, number>;
  };

  @ApiProperty({ description: 'Growth analytics' })
  growthAnalytics: {
    revenueGrowthRate: number;
    transactionGrowthRate: number;
    averageTransactionValue: number;
    topRevenueCreators: Array<{
      creatorId: string;
      creatorName: string;
      revenue: number;
    }>;
  };

  @ApiProperty({ description: 'Transaction statistics' })
  transactionStats: {
    totalTransactions: number;
    transactionsByType: Record<string, number>;
    averageTransactionValue: number;
    largestTransaction: number;
  };
}

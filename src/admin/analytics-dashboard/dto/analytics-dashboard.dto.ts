import { IsOptional, IsDateString, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EngagementBreakdownItemDto {
  @ApiProperty({ description: 'Metric label' })
  metric: string;

  @ApiProperty({ description: 'Metric value' })
  value: number;
}

export class AnalyticsPeriodDto {
  @ApiPropertyOptional({
    description: 'Start date for analytics period (ISO string)',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for analytics period (ISO string)',
    example: '2024-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Data granularity for time-based metrics',
    enum: ['day', 'week', 'month', 'year'],
    example: 'month'
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'year'])
  granularity?: 'day' | 'week' | 'month' | 'year';
}

export class PlatformStatisticsDto {
  @ApiProperty({ description: 'Total number of users' })
  totalUsers: number;

  @ApiProperty({ description: 'Total number of communities' })
  totalCommunities: number;

  @ApiProperty({ description: 'Total content items' })
  totalContent: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Active users in period' })
  activeUsers: number;

  @ApiProperty({ description: 'New users in period' })
  newUsers: number;

  @ApiProperty({ description: 'User growth rate percentage' })
  growthRate: number;

  @ApiProperty({ description: 'Platform health score (0-100)' })
  healthScore: number;
}

export class EngagementMetricsDto {
  @ApiProperty({ description: 'Total sessions' })
  totalSessions: number;

  @ApiProperty({ description: 'Average session duration in seconds' })
  averageSessionDuration: number;

  @ApiProperty({ description: 'Total page views' })
  pageViews: number;

  @ApiProperty({ description: 'Bounce rate (0-1)' })
  bounceRate: number;

  @ApiProperty({ description: 'Content interactions count' })
  contentInteractions: number;

  @ApiProperty({ description: 'Community participation count' })
  communityParticipation: number;

  @ApiProperty({ description: 'Engagement rate percentage' })
  engagementRate: number;

  @ApiProperty({ description: 'Backend-provided engagement chart breakdown', type: [EngagementBreakdownItemDto] })
  breakdown: EngagementBreakdownItemDto[];
}

export class RetentionAnalysisDto {
  @ApiProperty({ description: 'Day 1 retention rate' })
  day1Retention: number;

  @ApiProperty({ description: 'Day 7 retention rate' })
  day7Retention: number;

  @ApiProperty({ description: 'Day 30 retention rate' })
  day30Retention: number;

  @ApiProperty({ description: 'Overall retention rate' })
  overallRetention: number;

  @ApiProperty({ description: 'Churn rate' })
  churnRate: number;

  @ApiProperty({ description: 'Cohort analysis data' })
  cohortAnalysis: CohortData[];
}

export class CohortData {
  @ApiProperty({ description: 'Cohort period' })
  period: string;

  @ApiProperty({ description: 'Cohort size' })
  size: number;

  @ApiProperty({ description: 'Retained users' })
  retained: number;

  @ApiProperty({ description: 'Retention rate' })
  retentionRate: number;
}

export class DashboardResponseDto {
  @ApiProperty({ description: 'Platform-wide statistics' })
  platformStatistics: PlatformStatisticsDto;

  @ApiProperty({ description: 'Engagement metrics' })
  engagementMetrics: EngagementMetricsDto;

  @ApiProperty({ description: 'Retention analysis' })
  retentionAnalysis: RetentionAnalysisDto;

  @ApiProperty({ description: 'Revenue metrics' })
  revenueMetrics: any;

  @ApiProperty({ description: 'System health metrics' })
  healthMetrics: any;

  @ApiProperty({ description: 'User growth details including breakdown' })
  userGrowth: any;

  @ApiProperty({ description: 'Generated at timestamp' })
  generatedAt: Date;
}

export class AnalyticsExportDto extends AnalyticsPeriodDto {
  @ApiPropertyOptional({
    description: 'Export format',
    enum: ['csv', 'excel', 'pdf'],
    example: 'csv'
  })
  @IsOptional()
  @IsEnum(['csv', 'excel', 'pdf'])
  format?: 'csv' | 'excel' | 'pdf';

  @ApiPropertyOptional({
    description: 'Include charts in export',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiPropertyOptional({
    description: 'Custom fields to include',
    example: ['userGrowth', 'engagement', 'revenue']
  })
  @IsOptional()
  customFields?: string[];
}

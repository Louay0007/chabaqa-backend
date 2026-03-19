import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ContentType, ModerationStatus } from '../../schemas/content-moderation-queue.schema';
import { TimePeriod } from '../../common/interfaces/admin-interfaces';

/**
 * DTO for content moderation analytics filters
 */
export class ContentModerationAnalyticsFiltersDto {
  @ApiPropertyOptional({ 
    description: 'Time period for analytics',
    enum: TimePeriod,
    default: TimePeriod.LAST_30_DAYS
  })
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: string = TimePeriod.LAST_30_DAYS;

  @ApiPropertyOptional({ 
    description: 'Custom start date (required if period is CUSTOM)'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ 
    description: 'Custom end date (required if period is CUSTOM)'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by content type',
    enum: ContentType
  })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by community ID'
  })
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by moderator ID'
  })
  @IsOptional()
  moderatorId?: string;
}

/**
 * Response DTO for content engagement metrics
 */
export class ContentEngagementMetricsDto {
  @ApiProperty({ description: 'Total content items processed' })
  totalProcessed: number;

  @ApiProperty({ description: 'Average processing time in hours' })
  averageProcessingTime: number;

  @ApiProperty({ description: 'Content approval rate percentage' })
  approvalRate: number;

  @ApiProperty({ description: 'Content rejection rate percentage' })
  rejectionRate: number;

  @ApiProperty({ description: 'Content flagging rate percentage' })
  flaggingRate: number;

  @ApiProperty({ description: 'Content escalation rate percentage' })
  escalationRate: number;

  @ApiProperty({ description: 'Average engagement score' })
  averageEngagementScore: number;

  @ApiProperty({ description: 'Content quality score (0-100)' })
  qualityScore: number;

  @ApiProperty({ description: 'User report rate percentage' })
  reportRate: number;

  @ApiProperty({ description: 'False positive rate percentage' })
  falsePositiveRate: number;

  @ApiProperty({ description: 'Content by type breakdown' })
  contentTypeBreakdown: Record<ContentType, {
    count: number;
    approvalRate: number;
    averageProcessingTime: number;
  }>;

  @ApiProperty({ description: 'Trending content categories' })
  trendingCategories: Array<{
    category: string;
    count: number;
    growthRate: number;
  }>;
}

/**
 * Response DTO for moderation performance tracking
 */
export class ModerationPerformanceDto {
  @ApiProperty({ description: 'Total moderators active in period' })
  totalModerators: number;

  @ApiProperty({ description: 'Average items processed per moderator' })
  averageItemsPerModerator: number;

  @ApiProperty({ description: 'Fastest processing moderator' })
  fastestModerator: {
    moderatorId: string;
    moderatorName: string;
    averageTime: number;
    itemsProcessed: number;
  };

  @ApiProperty({ description: 'Most productive moderator' })
  mostProductiveModerator: {
    moderatorId: string;
    moderatorName: string;
    itemsProcessed: number;
    accuracyRate: number;
  };

  @ApiProperty({ description: 'Moderator performance breakdown' })
  moderatorPerformance: Array<{
    moderatorId: string;
    moderatorName: string;
    itemsProcessed: number;
    averageProcessingTime: number;
    approvalRate: number;
    accuracyScore: number;
    escalationRate: number;
  }>;

  @ApiProperty({ description: 'Processing time distribution' })
  processingTimeDistribution: {
    under1Hour: number;
    under4Hours: number;
    under24Hours: number;
    over24Hours: number;
  };

  @ApiProperty({ description: 'Workload distribution by day of week' })
  workloadByDay: Record<string, number>;

  @ApiProperty({ description: 'Peak processing hours' })
  peakHours: Array<{
    hour: number;
    itemsProcessed: number;
  }>;
}

/**
 * Response DTO for content quality metrics
 */
export class ContentQualityMetricsDto {
  @ApiProperty({ description: 'Overall content quality score (0-100)' })
  overallQualityScore: number;

  @ApiProperty({ description: 'Quality improvement trend percentage' })
  qualityTrend: number;

  @ApiProperty({ description: 'Auto-moderation accuracy rate' })
  autoModerationAccuracy: number;

  @ApiProperty({ description: 'Manual review requirement rate' })
  manualReviewRate: number;

  @ApiProperty({ description: 'Content quality by type' })
  qualityByType: Record<ContentType, {
    qualityScore: number;
    reportRate: number;
    approvalRate: number;
    averageEngagement: number;
  }>;

  @ApiProperty({ description: 'Common rejection reasons' })
  rejectionReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
    trend: number;
  }>;

  @ApiProperty({ description: 'Content creator quality distribution' })
  creatorQualityDistribution: {
    highQuality: number;    // Creators with >90% approval rate
    mediumQuality: number;  // Creators with 70-90% approval rate
    lowQuality: number;     // Creators with <70% approval rate
  };

  @ApiProperty({ description: 'Repeat offenders (creators with multiple rejections)' })
  repeatOffenders: Array<{
    creatorId: string;
    creatorName: string;
    rejectionCount: number;
    rejectionRate: number;
    lastRejectionDate: Date;
  }>;

  @ApiProperty({ description: 'Content improvement suggestions' })
  improvementSuggestions: Array<{
    category: string;
    suggestion: string;
    impact: 'high' | 'medium' | 'low';
    affectedContent: number;
  }>;
}

/**
 * Response DTO for comprehensive content moderation analytics
 */
export class ContentModerationAnalyticsDto {
  @ApiProperty({ description: 'Analytics period information' })
  period: {
    startDate: Date;
    endDate: Date;
    label: string;
  };

  @ApiProperty({ description: 'Content engagement metrics' })
  engagementMetrics: ContentEngagementMetricsDto;

  @ApiProperty({ description: 'Moderation performance tracking' })
  performanceMetrics: ModerationPerformanceDto;

  @ApiProperty({ description: 'Content quality metrics' })
  qualityMetrics: ContentQualityMetricsDto;

  @ApiProperty({ description: 'Key performance indicators' })
  kpis: {
    totalContentProcessed: number;
    averageProcessingTime: number;
    overallApprovalRate: number;
    moderatorEfficiency: number;
    contentQualityScore: number;
    userSatisfactionScore: number;
  };

  @ApiProperty({ description: 'Trends and insights' })
  insights: Array<{
    type: 'positive' | 'negative' | 'neutral';
    title: string;
    description: string;
    metric: string;
    value: number;
    change: number;
  }>;

  @ApiProperty({ description: 'Recommendations for improvement' })
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    expectedImpact: string;
  }>;
}
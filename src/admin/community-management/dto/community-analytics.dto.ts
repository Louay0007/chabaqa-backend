import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TimePeriod } from '../../common/interfaces/admin-interfaces';

export class CommunityAnalyticsFiltersDto {
  @ApiProperty({ 
    enum: TimePeriod, 
    required: false, 
    default: TimePeriod.LAST_30_DAYS,
    description: 'Time period for analytics data'
  })
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: string = TimePeriod.LAST_30_DAYS;

  @ApiProperty({ required: false, description: 'Custom start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Custom end date (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, description: 'Filter by creator ID' })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiProperty({ required: false, description: 'Minimum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minMembers?: number;

  @ApiProperty({ required: false, description: 'Maximum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMembers?: number;

  @ApiProperty({ required: false, description: 'Include only active communities' })
  @IsOptional()
  @Type(() => Boolean)
  activeOnly?: boolean = true;

  @ApiProperty({ required: false, description: 'Include only verified communities' })
  @IsOptional()
  @Type(() => Boolean)
  verifiedOnly?: boolean;
}

export class CommunityGrowthMetricsDto {
  @ApiProperty({ description: 'Daily member growth' })
  daily: number;

  @ApiProperty({ description: 'Weekly member growth' })
  weekly: number;

  @ApiProperty({ description: 'Monthly member growth' })
  monthly: number;

  @ApiProperty({ description: 'Growth rate percentage' })
  growthRate: number;

  @ApiProperty({ description: 'Growth trend (positive, negative, stable)' })
  trend: 'positive' | 'negative' | 'stable';
}

export class CommunityEngagementMetricsDto {
  @ApiProperty({ description: 'Number of active members' })
  activeMembers: number;

  @ApiProperty({ description: 'Engagement rate percentage' })
  engagementRate: number;

  @ApiProperty({ description: 'Average session duration in seconds' })
  averageSessionDuration: number;

  @ApiProperty({ description: 'Posts per member ratio' })
  postsPerMember: number;

  @ApiProperty({ description: 'Comments per post ratio' })
  commentsPerPost: number;

  @ApiProperty({ description: 'Member interaction score' })
  interactionScore: number;
}

export class CommunityRevenueMetricsDto {
  @ApiProperty({ description: 'Total revenue generated' })
  totalRevenue: number;

  @ApiProperty({ description: 'Monthly recurring revenue' })
  monthlyRecurringRevenue: number;

  @ApiProperty({ description: 'Average revenue per user' })
  averageRevenuePerUser: number;

  @ApiProperty({ description: 'Revenue growth rate' })
  revenueGrowthRate: number;

  @ApiProperty({ description: 'Conversion rate from free to paid' })
  conversionRate: number;

  @ApiProperty({ description: 'Churn rate percentage' })
  churnRate: number;
}

export class CommunityContentMetricsDto {
  @ApiProperty({ description: 'Total number of posts' })
  totalPosts: number;

  @ApiProperty({ description: 'Total number of courses' })
  totalCourses: number;

  @ApiProperty({ description: 'Total number of events' })
  totalEvents: number;

  @ApiProperty({ description: 'Total number of products' })
  totalProducts: number;

  @ApiProperty({ description: 'Content creation rate (items per day)' })
  contentCreationRate: number;

  @ApiProperty({ description: 'Most popular content type' })
  popularContentType: string;
}

export class CommunityRetentionMetricsDto {
  @ApiProperty({ description: 'Day 1 retention rate' })
  day1Retention: number;

  @ApiProperty({ description: 'Day 7 retention rate' })
  day7Retention: number;

  @ApiProperty({ description: 'Day 30 retention rate' })
  day30Retention: number;

  @ApiProperty({ description: 'Average member lifetime in days' })
  averageLifetime: number;

  @ApiProperty({ description: 'Member satisfaction score' })
  satisfactionScore: number;
}

export class CommunityPerformanceMetricsDto {
  @ApiProperty({ description: 'Community health score (0-100)' })
  healthScore: number;

  @ApiProperty({ description: 'Activity level (low, medium, high)' })
  activityLevel: 'low' | 'medium' | 'high';

  @ApiProperty({ description: 'Quality score based on ratings' })
  qualityScore: number;

  @ApiProperty({ description: 'Moderation score' })
  moderationScore: number;

  @ApiProperty({ description: 'Overall performance rating' })
  performanceRating: number;
}

export class DetailedCommunityAnalyticsDto {
  @ApiProperty({ description: 'Community ID' })
  communityId: string;

  @ApiProperty({ description: 'Community name' })
  communityName: string;

  @ApiProperty({ description: 'Community slug' })
  communitySlug: string;

  @ApiProperty({ description: 'Community category' })
  category: string;

  @ApiProperty({ description: 'Current member count' })
  membersCount: number;

  @ApiProperty({ description: 'Community creation date' })
  createdAt: Date;

  @ApiProperty({ type: CommunityGrowthMetricsDto })
  growthMetrics: CommunityGrowthMetricsDto;

  @ApiProperty({ type: CommunityEngagementMetricsDto })
  engagementMetrics: CommunityEngagementMetricsDto;

  @ApiProperty({ type: CommunityRevenueMetricsDto })
  revenueMetrics: CommunityRevenueMetricsDto;

  @ApiProperty({ type: CommunityContentMetricsDto })
  contentMetrics: CommunityContentMetricsDto;

  @ApiProperty({ type: CommunityRetentionMetricsDto })
  retentionMetrics: CommunityRetentionMetricsDto;

  @ApiProperty({ type: CommunityPerformanceMetricsDto })
  performanceMetrics: CommunityPerformanceMetricsDto;

  @ApiProperty({ description: 'Analysis period' })
  period: {
    startDate: Date;
    endDate: Date;
    periodType: string;
  };

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}

export class CommunityAnalyticsSummaryDto {
  @ApiProperty({ description: 'Total number of communities analyzed' })
  totalCommunities: number;

  @ApiProperty({ description: 'Total members across all communities' })
  totalMembers: number;

  @ApiProperty({ description: 'Total revenue across all communities' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average engagement rate' })
  averageEngagementRate: number;

  @ApiProperty({ description: 'Top performing communities', type: [String] })
  topCommunities: string[];

  @ApiProperty({ description: 'Communities needing attention', type: [String] })
  communitiesNeedingAttention: string[];

  @ApiProperty({ description: 'Growth trends summary' })
  growthTrends: {
    growing: number;
    stable: number;
    declining: number;
  };

  @ApiProperty({ description: 'Revenue distribution by category' })
  revenueByCategory: Record<string, number>;

  @ApiProperty({ description: 'Member distribution by category' })
  membersByCategory: Record<string, number>;

  @ApiProperty({ description: 'Analysis period' })
  period: {
    startDate: Date;
    endDate: Date;
    periodType: string;
  };
}

export class CommunityComparisonDto {
  @ApiProperty({ description: 'Community A data', type: DetailedCommunityAnalyticsDto })
  communityA: DetailedCommunityAnalyticsDto;

  @ApiProperty({ description: 'Community B data', type: DetailedCommunityAnalyticsDto })
  communityB: DetailedCommunityAnalyticsDto;

  @ApiProperty({ description: 'Comparison insights' })
  comparison: {
    memberGrowthDifference: number;
    engagementDifference: number;
    revenueDifference: number;
    performanceDifference: number;
    winner: 'A' | 'B' | 'tie';
    insights: string[];
  };
}
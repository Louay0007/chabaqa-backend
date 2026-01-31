import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsMongoId } from 'class-validator';

export class CommunicationAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for analytics (ISO 8601 format)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for analytics (ISO 8601 format)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by community ID',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  communityId?: string;
}

export class CampaignPerformanceDto {
  @ApiProperty({ description: 'Campaign ID', example: '507f1f77bcf86cd799439011' })
  campaignId: string;

  @ApiProperty({ description: 'Campaign title', example: 'Welcome Campaign' })
  title: string;

  @ApiProperty({ description: 'Total emails sent', example: 1000 })
  totalSent: number;

  @ApiProperty({ description: 'Total emails delivered', example: 980 })
  delivered: number;

  @ApiProperty({ description: 'Total emails opened', example: 450 })
  opened: number;

  @ApiProperty({ description: 'Total clicks', example: 120 })
  clicked: number;

  @ApiProperty({ description: 'Open rate percentage', example: 45.92 })
  openRate: number;

  @ApiProperty({ description: 'Click-through rate percentage', example: 12.24 })
  clickRate: number;

  @ApiProperty({ description: 'Delivery rate percentage', example: 98.0 })
  deliveryRate: number;

  @ApiProperty({ description: 'Campaign sent date' })
  sentAt: Date;
}

export class CommunicationMetricsDto {
  @ApiProperty({ description: 'Total campaigns sent', example: 50 })
  totalCampaigns: number;

  @ApiProperty({ description: 'Total emails sent', example: 50000 })
  totalEmailsSent: number;

  @ApiProperty({ description: 'Total emails delivered', example: 49000 })
  totalDelivered: number;

  @ApiProperty({ description: 'Total emails opened', example: 22500 })
  totalOpened: number;

  @ApiProperty({ description: 'Total clicks', example: 6000 })
  totalClicks: number;

  @ApiProperty({ description: 'Average open rate percentage', example: 45.92 })
  averageOpenRate: number;

  @ApiProperty({ description: 'Average click-through rate percentage', example: 12.24 })
  averageClickRate: number;

  @ApiProperty({ description: 'Average delivery rate percentage', example: 98.0 })
  averageDeliveryRate: number;

  @ApiProperty({ description: 'Total bounced emails', example: 1000 })
  totalBounced: number;

  @ApiProperty({ description: 'Bounce rate percentage', example: 2.0 })
  bounceRate: number;
}

export class DeliveryStatusDto {
  @ApiProperty({ description: 'Campaign ID', example: '507f1f77bcf86cd799439011' })
  campaignId: string;

  @ApiProperty({ description: 'Campaign title', example: 'Welcome Campaign' })
  title: string;

  @ApiProperty({ description: 'Total recipients', example: 1000 })
  totalRecipients: number;

  @ApiProperty({ description: 'Pending deliveries', example: 50 })
  pending: number;

  @ApiProperty({ description: 'Successfully sent', example: 900 })
  sent: number;

  @ApiProperty({ description: 'Failed deliveries', example: 30 })
  failed: number;

  @ApiProperty({ description: 'Bounced emails', example: 20 })
  bounced: number;

  @ApiProperty({ description: 'Delivery status', example: 'completed' })
  status: string;

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}

export class EngagementStatisticsDto {
  @ApiProperty({ description: 'Time period', example: 'last_30_days' })
  period: string;

  @ApiProperty({ description: 'Total campaigns in period', example: 10 })
  campaignsCount: number;

  @ApiProperty({ description: 'Total recipients reached', example: 10000 })
  totalRecipients: number;

  @ApiProperty({ description: 'Unique users engaged', example: 4500 })
  uniqueEngaged: number;

  @ApiProperty({ description: 'Engagement rate percentage', example: 45.0 })
  engagementRate: number;

  @ApiProperty({ description: 'Average time to open (hours)', example: 2.5 })
  averageTimeToOpen: number;

  @ApiProperty({ description: 'Average time to click (hours)', example: 3.2 })
  averageTimeToClick: number;

  @ApiProperty({ description: 'Best performing campaign' })
  bestCampaign: {
    id: string;
    title: string;
    openRate: number;
  };

  @ApiProperty({ description: 'Worst performing campaign' })
  worstCampaign: {
    id: string;
    title: string;
    openRate: number;
  };
}

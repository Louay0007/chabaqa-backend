import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ContentType, ModerationStatus, ModerationPriority, ModerationReason } from '../../schemas/content-moderation-queue.schema';

/**
 * Response DTO for content moderation queue items
 */
export class ContentModerationItemResponseDto {
  @ApiProperty({ description: 'Moderation queue item ID' })
  _id: string;

  @ApiProperty({ description: 'Content ID being moderated' })
  contentId: string;

  @ApiProperty({ description: 'Type of content', enum: ContentType })
  contentType: string;

  @ApiProperty({ description: 'Creator information' })
  creator: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };

  @ApiPropertyOptional({ description: 'Community information if applicable' })
  community?: {
    _id: string;
    name: string;
    slug: string;
  };

  @ApiProperty({ description: 'Current moderation status', enum: ModerationStatus })
  status: string;

  @ApiProperty({ description: 'Priority level', enum: ModerationPriority })
  priority: string;

  @ApiPropertyOptional({ description: 'Reviewer information if reviewed' })
  reviewer?: {
    _id: string;
    name: string;
    email: string;
  };

  @ApiPropertyOptional({ description: 'Review timestamp' })
  reviewedAt?: Date;

  @ApiPropertyOptional({ description: 'Review notes from moderator' })
  reviewNotes?: string;

  @ApiPropertyOptional({ description: 'Rejection reasons', enum: ModerationReason, isArray: true })
  rejectionReasons?: ModerationReason[];

  @ApiProperty({ description: 'Submission timestamp' })
  submittedAt: Date;

  @ApiPropertyOptional({ description: 'Escalation timestamp' })
  escalatedAt?: Date;

  @ApiPropertyOptional({ description: 'Escalation reason' })
  escalationReason?: string;

  @ApiPropertyOptional({ description: 'Content snapshot at submission' })
  contentSnapshot?: Record<string, any>;

  @ApiProperty({ description: 'Number of user reports' })
  reportCount: number;

  @ApiPropertyOptional({ description: 'Automated moderation score' })
  autoModerationScore?: number;

  @ApiPropertyOptional({ description: 'Automated moderation flags' })
  autoModerationFlags?: Record<string, any>;

  @ApiProperty({ description: 'Whether manual review is required' })
  requiresManualReview: boolean;

  @ApiPropertyOptional({ description: 'Review deadline' })
  reviewDeadline?: Date;

  @ApiProperty({ description: 'Content tags', isArray: true })
  tags: string[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

/**
 * Response DTO for content details with full content information
 */
export class ContentDetailsResponseDto extends ContentModerationItemResponseDto {
  @ApiProperty({ description: 'Full content data' })
  contentData: {
    title?: string;
    description?: string;
    content?: string;
    images?: string[];
    videos?: string[];
    metadata?: Record<string, any>;
  };

  @ApiPropertyOptional({ description: 'Content engagement metrics' })
  engagementMetrics?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };

  @ApiPropertyOptional({ description: 'User reports details' })
  reports?: Array<{
    reporterId: string;
    reporterName: string;
    reason: string;
    reportedAt: Date;
    description?: string;
  }>;
}

/**
 * Response DTO for bulk moderation operations
 */
export class BulkModerationResponseDto {
  @ApiProperty({ description: 'Total number of items processed' })
  totalItems: number;

  @ApiProperty({ description: 'Number of successfully processed items' })
  successCount: number;

  @ApiProperty({ description: 'Number of failed items' })
  failureCount: number;

  @ApiProperty({ description: 'Details of failed items', isArray: true })
  failures: Array<{
    itemId: string;
    error: string;
    code?: string;
  }>;

  @ApiProperty({ description: 'Operation summary message' })
  summary: string;

  @ApiProperty({ description: 'Processing duration in milliseconds' })
  processingTime: number;
}

/**
 * Response DTO for moderation queue statistics
 */
export class ModerationQueueStatsResponseDto {
  @ApiProperty({ description: 'Total items in queue' })
  totalItems: number;

  @ApiProperty({ description: 'Items by status' })
  byStatus: Record<ModerationStatus, number>;

  @ApiProperty({ description: 'Items by content type' })
  byContentType: Record<ContentType, number>;

  @ApiProperty({ description: 'Items by priority' })
  byPriority: Record<ModerationPriority, number>;

  @ApiProperty({ description: 'Average processing time in hours' })
  averageProcessingTime: number;

  @ApiProperty({ description: 'Items requiring urgent attention' })
  urgentItems: number;

  @ApiProperty({ description: 'Overdue items (past deadline)' })
  overdueItems: number;

  @ApiProperty({ description: 'Items with reports' })
  reportedItems: number;

  @ApiProperty({ description: 'Items requiring manual review' })
  manualReviewItems: number;

  @ApiProperty({ description: 'Today\'s processed items' })
  todayProcessed: number;

  @ApiProperty({ description: 'This week\'s processed items' })
  weekProcessed: number;
}
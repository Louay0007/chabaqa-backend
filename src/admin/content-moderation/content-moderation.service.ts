import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { 
  ContentModerationQueue, 
  ContentModerationQueueDocument,
  ContentType,
  ModerationStatus,
  ModerationPriority,
  ModerationReason
} from '../schemas/content-moderation-queue.schema';
import { AuditLogService } from '../common/services/audit-log.service';
import { AdminNotificationService } from '../common/services/admin-notification.service';
import { 
  PaginatedResult, 
  BulkOperationResult,
  AdminActionContext,
  TimePeriod
} from '../common/interfaces/admin-interfaces';
import { AdminAction } from '../schemas/audit-log.schema';
import { ContentModerationFiltersDto } from './dto/content-moderation-filters.dto';
import { ModerateContentDto, BulkModerateContentDto, UpdateContentPriorityDto, AssignContentDto } from './dto/moderate-content.dto';
import { 
  ContentModerationItemResponseDto, 
  ContentDetailsResponseDto, 
  BulkModerationResponseDto,
  ModerationQueueStatsResponseDto
} from './dto/content-moderation-response.dto';
import { 
  ContentModerationAnalyticsFiltersDto,
  ContentModerationAnalyticsDto,
  ContentEngagementMetricsDto,
  ModerationPerformanceDto,
  ContentQualityMetricsDto
} from './dto/content-moderation-analytics.dto';

// Import content schemas for moderation integration
import { Post, PostDocument } from '../../schema/post.schema';
import { Cours, CoursDocument } from '../../schema/course.schema';
import { Event, EventDocument } from '../../schema/event.schema';
import { Product, ProductDocument } from '../../schema/product.schema';

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(
    @InjectModel(ContentModerationQueue.name)
    private readonly contentModerationModel: Model<ContentModerationQueueDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Cours.name)
    private readonly courseModel: Model<CoursDocument>,
    @InjectModel(Event.name)
    private readonly eventModel: Model<EventDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  /**
   * Get moderation queue with filtering and pagination
   */
  async getModerationQueue(
    filters: ContentModerationFiltersDto,
    adminContext: AdminActionContext
  ): Promise<PaginatedResult<ContentModerationItemResponseDto>> {
    try {
      const query = this.buildFilterQuery(filters);
      const sortOptions = this.buildSortOptions(filters.sortBy, filters.sortOrder);

      const [items, total] = await Promise.all([
        this.contentModerationModel
          .find(query)
          .populate('creator', 'name email avatar')
          .populate('community', 'name slug')
          .populate('reviewer', 'name email')
          .sort(sortOptions)
          .skip(((filters.page || 1) - 1) * (filters.limit || 20))
          .limit(filters.limit || 20)
          .lean()
          .exec(),
        this.contentModerationModel.countDocuments(query).exec()
      ]);

      const totalPages = Math.ceil(total / (filters.limit || 20));

      // Log the query action
      await this.auditLogService.logAction({
        ...adminContext,
        action: AdminAction.CONTENT_MODERATION_QUEUE_VIEW,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(), // Placeholder for bulk query
        metadata: { 
          filters: this.sanitizeFilters(filters),
          resultCount: items.length,
          totalCount: total
        }
      });

      return {
        data: items.map(item => this.transformToResponseDto(item)),
        total,
        page: filters.page || 1,
        limit: filters.limit || 20,
        totalPages,
        hasNextPage: (filters.page || 1) < totalPages,
        hasPrevPage: (filters.page || 1) > 1
      };
    } catch (error) {
      this.logger.error('Error fetching moderation queue', error);
      throw error;
    }
  }

  /**
   * Get detailed content information for moderation
   */
  async getContentDetails(
    itemId: string,
    adminContext: AdminActionContext
  ): Promise<ContentDetailsResponseDto> {
    try {
      const item = await this.contentModerationModel
        .findById(itemId)
        .populate('creator', 'name email avatar')
        .populate('community', 'name slug')
        .populate('reviewer', 'name email')
        .populate('reportedBy', 'name email')
        .lean()
        .exec();

      if (!item) {
        throw new NotFoundException(`Content moderation item with ID ${itemId} not found`);
      }

      // Fetch actual content data based on content type
      const contentData = await this.fetchContentData(item.contentId, item.contentType);
      
      // Fetch engagement metrics
      const engagementMetrics = await this.fetchEngagementMetrics(item.contentId, item.contentType);

      // Fetch user reports
      const reports = await this.fetchUserReports(item.contentId);

      // Log the view action
      await this.auditLogService.logAction({
        ...adminContext,
        action: AdminAction.CONTENT_MODERATION_VIEW,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId),
        metadata: { 
          contentType: item.contentType,
          contentId: item.contentId.toString()
        }
      });

      return {
        ...this.transformToResponseDto(item),
        contentData,
        engagementMetrics,
        reports
      };
    } catch (error) {
      this.logger.error(`Error fetching content details for item ${itemId}`, error);
      throw error;
    }
  }

  /**
   * Moderate individual content item
   */
  async moderateContent(
    itemId: string,
    moderationData: ModerateContentDto,
    adminContext: AdminActionContext
  ): Promise<ContentModerationItemResponseDto> {
    try {
      const item = await this.contentModerationModel.findById(itemId).exec();
      
      if (!item) {
        throw new NotFoundException(`Content moderation item with ID ${itemId} not found`);
      }

      if (item.status !== ModerationStatus.PENDING && item.status !== ModerationStatus.UNDER_REVIEW) {
        throw new BadRequestException(`Content has already been moderated with status: ${item.status}`);
      }

      // Validate escalation requirements
      if (moderationData.action === ModerationStatus.ESCALATED && !moderationData.escalationReason) {
        throw new BadRequestException('Escalation reason is required when escalating content');
      }

      // Store previous data for audit
      const previousData = {
        status: item.status,
        reviewedBy: item.reviewedBy,
        reviewNotes: item.reviewNotes,
        rejectionReasons: item.rejectionReasons
      };

      // Update the item
      const updatedItem = await this.contentModerationModel
        .findByIdAndUpdate(
          itemId,
          {
            status: moderationData.action,
            reviewedBy: adminContext.adminUserId,
            reviewedAt: new Date(),
            reviewNotes: moderationData.reviewNotes,
            rejectionReasons: moderationData.rejectionReasons,
            escalatedAt: moderationData.action === ModerationStatus.ESCALATED ? new Date() : undefined,
            escalationReason: moderationData.escalationReason,
            tags: moderationData.tags ? [...(item.tags || []), ...moderationData.tags] : item.tags
          },
          { new: true }
        )
        .populate('creator', 'name email avatar')
        .populate('community', 'name slug')
        .populate('reviewer', 'name email')
        .exec();

      // Handle content publication/rejection based on moderation decision
      if (updatedItem) {
        await this.handleContentModerationDecision(updatedItem, moderationData.action as ModerationStatus);

        // Send notifications
        await this.sendModerationNotifications(updatedItem, moderationData.action as ModerationStatus);
      }

      // Log the moderation action
      await this.auditLogService.logAction({
        ...adminContext,
        action: this.getModerationAuditAction(moderationData.action as ModerationStatus),
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId),
        previousData,
        newData: {
          status: moderationData.action,
          reviewNotes: moderationData.reviewNotes,
          rejectionReasons: moderationData.rejectionReasons
        },
        metadata: {
          contentType: item.contentType,
          contentId: item.contentId.toString()
        }
      });

      return this.transformToResponseDto(updatedItem!);
    } catch (error) {
      this.logger.error(`Error moderating content item ${itemId}`, error);
      throw error;
    }
  }

  /**
   * Bulk moderate multiple content items
   */
  async bulkModerateContent(
    bulkData: BulkModerateContentDto,
    adminContext: AdminActionContext
  ): Promise<BulkModerationResponseDto> {
    const startTime = Date.now();
    const results: BulkOperationResult = {
      totalItems: bulkData.itemIds.length,
      successCount: 0,
      failureCount: 0,
      failures: [],
      summary: ''
    };

    try {
      // Validate bulk operation size
      if (bulkData.itemIds.length > 100) {
        throw new BadRequestException('Bulk operations are limited to 100 items at a time');
      }

      // Process each item
      for (const itemId of bulkData.itemIds) {
        try {
          await this.moderateContent(itemId, {
            action: bulkData.action,
            reviewNotes: bulkData.reviewNotes,
            rejectionReasons: bulkData.rejectionReasons
          }, adminContext);
          
          results.successCount++;
        } catch (error) {
          results.failureCount++;
          results.failures.push({
            itemId,
            error: error.message,
            code: error.code || 'MODERATION_ERROR'
          });
        }
      }

      const processingTime = Date.now() - startTime;
      results.summary = `Processed ${results.totalItems} items: ${results.successCount} successful, ${results.failureCount} failed`;

      // Log bulk operation
      await this.auditLogService.logAction({
        ...adminContext,
        action: AdminAction.CONTENT_BULK_MODERATION,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(), // Placeholder for bulk operation
        metadata: {
          action: bulkData.action,
          itemCount: bulkData.itemIds.length,
          successCount: results.successCount,
          failureCount: results.failureCount,
          processingTime
        }
      });

      return {
        ...results,
        processingTime
      };
    } catch (error) {
      this.logger.error('Error in bulk moderation operation', error);
      throw error;
    }
  }

  /**
   * Update content priority
   */
  async updateContentPriority(
    itemId: string,
    priorityData: UpdateContentPriorityDto,
    adminContext: AdminActionContext
  ): Promise<ContentModerationItemResponseDto> {
    try {
      const item = await this.contentModerationModel.findById(itemId).exec();
      
      if (!item) {
        throw new NotFoundException(`Content moderation item with ID ${itemId} not found`);
      }

      const previousPriority = item.priority;
      
      const updatedItem = await this.contentModerationModel
        .findByIdAndUpdate(
          itemId,
          { 
            priority: priorityData.priority as ModerationPriority,
            metadata: {
              ...item.metadata,
              priorityChangeReason: priorityData.reason,
              priorityChangedAt: new Date(),
              priorityChangedBy: adminContext.adminUserId
            }
          },
          { new: true }
        )
        .populate('creator', 'name email avatar')
        .populate('community', 'name slug')
        .populate('reviewer', 'name email')
        .exec();

      // Log priority change
      await this.auditLogService.logAction({
        ...adminContext,
        action: AdminAction.CONTENT_PRIORITY_UPDATE,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId),
        previousData: { priority: previousPriority },
        newData: { priority: priorityData.priority },
        metadata: {
          reason: priorityData.reason,
          contentType: item.contentType
        }
      });

      return this.transformToResponseDto(updatedItem);
    } catch (error) {
      this.logger.error(`Error updating content priority for item ${itemId}`, error);
      throw error;
    }
  }

  /**
   * Assign content to specific moderator
   */
  async assignContent(
    itemId: string,
    assignmentData: AssignContentDto,
    adminContext: AdminActionContext
  ): Promise<ContentModerationItemResponseDto> {
    try {
      const item = await this.contentModerationModel.findById(itemId).exec();
      
      if (!item) {
        throw new NotFoundException(`Content moderation item with ID ${itemId} not found`);
      }

      const updatedItem = await this.contentModerationModel
        .findByIdAndUpdate(
          itemId,
          {
            status: ModerationStatus.UNDER_REVIEW,
            reviewedBy: new Types.ObjectId(assignmentData.moderatorId),
            metadata: {
              ...item.metadata,
              assignmentNotes: assignmentData.notes,
              assignedAt: new Date(),
              assignedBy: adminContext.adminUserId
            }
          },
          { new: true }
        )
        .populate('creator', 'name email avatar')
        .populate('community', 'name slug')
        .populate('reviewer', 'name email')
        .exec();

      // Log assignment
      await this.auditLogService.logAction({
        ...adminContext,
        action: AdminAction.CONTENT_ASSIGNMENT,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId),
        metadata: {
          assignedTo: assignmentData.moderatorId,
          notes: assignmentData.notes,
          contentType: item.contentType
        }
      });

      return this.transformToResponseDto(updatedItem);
    } catch (error) {
      this.logger.error(`Error assigning content item ${itemId}`, error);
      throw error;
    }
  }

  /**
   * Get moderation queue statistics
   */
  async getModerationStats(): Promise<ModerationQueueStatsResponseDto> {
    try {
      const [
        totalItems,
        statusCounts,
        typeCounts,
        priorityCounts,
        urgentItems,
        overdueItems,
        reportedItems,
        manualReviewItems,
        todayProcessed,
        weekProcessed,
        avgProcessingTime
      ] = await Promise.all([
        this.contentModerationModel.countDocuments().exec(),
        this.getCountsByField('status'),
        this.getCountsByField('contentType'),
        this.getCountsByField('priority'),
        this.contentModerationModel.countDocuments({ priority: ModerationPriority.URGENT }).exec(),
        this.contentModerationModel.countDocuments({ 
          reviewDeadline: { $lt: new Date() },
          status: { $in: [ModerationStatus.PENDING, ModerationStatus.UNDER_REVIEW] }
        }).exec(),
        this.contentModerationModel.countDocuments({ reportCount: { $gt: 0 } }).exec(),
        this.contentModerationModel.countDocuments({ requiresManualReview: true }).exec(),
        this.getProcessedCount('today'),
        this.getProcessedCount('week'),
        this.calculateAverageProcessingTime()
      ]);

      return {
        totalItems,
        byStatus: statusCounts,
        byContentType: typeCounts,
        byPriority: priorityCounts,
        averageProcessingTime: avgProcessingTime,
        urgentItems,
        overdueItems,
        reportedItems,
        manualReviewItems,
        todayProcessed,
        weekProcessed
      };
    } catch (error) {
      this.logger.error('Error fetching moderation statistics', error);
      throw error;
    }
  }

  // Private helper methods

  private buildFilterQuery(filters: ContentModerationFiltersDto): FilterQuery<ContentModerationQueueDocument> {
    const query: FilterQuery<ContentModerationQueueDocument> = {};

    if (filters.contentTypes?.length) {
      query.contentType = { $in: filters.contentTypes };
    }

    if (filters.status?.length) {
      query.status = { $in: filters.status };
    }

    if (filters.priorities?.length) {
      query.priority = { $in: filters.priorities };
    }

    if (filters.creatorId) {
      query.creatorId = new Types.ObjectId(filters.creatorId);
    }

    if (filters.communityId) {
      query.communityId = new Types.ObjectId(filters.communityId);
    }

    if (filters.reviewedBy) {
      query.reviewedBy = new Types.ObjectId(filters.reviewedBy);
    }

    if (filters.startDate || filters.endDate) {
      query.submittedAt = {};
      if (filters.startDate) {
        query.submittedAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.submittedAt.$lte = new Date(filters.endDate);
      }
    }

    if (filters.requiresManualReview !== undefined) {
      query.requiresManualReview = filters.requiresManualReview;
    }

    if (filters.hasReports) {
      query.reportCount = { $gt: 0 };
    }

    if (filters.minReportCount !== undefined) {
      query.reportCount = { $gte: filters.minReportCount };
    }

    if (filters.tags?.length) {
      query.tags = { $in: filters.tags };
    }

    if (filters.overdue) {
      query.reviewDeadline = { $lt: new Date() };
      query.status = { $in: [ModerationStatus.PENDING, ModerationStatus.UNDER_REVIEW] };
    }

    return query;
  }

  private buildSortOptions(sortBy?: string, sortOrder?: 'asc' | 'desc'): Record<string, 1 | -1> {
    const order = sortOrder === 'asc' ? 1 : -1;
    
    switch (sortBy) {
      case 'priority':
        return { priority: order, submittedAt: -1 };
      case 'status':
        return { status: order, submittedAt: -1 };
      case 'contentType':
        return { contentType: order, submittedAt: -1 };
      case 'reportCount':
        return { reportCount: order, submittedAt: -1 };
      case 'reviewedAt':
        return { reviewedAt: order };
      default:
        return { submittedAt: order };
    }
  }

  private transformToResponseDto(item: any): ContentModerationItemResponseDto {
    return {
      _id: item._id.toString(),
      contentId: item.contentId.toString(),
      contentType: item.contentType,
      creator: item.creator ? {
        _id: item.creator._id.toString(),
        name: item.creator.name,
        email: item.creator.email,
        avatar: item.creator.avatar
      } : {
        _id: '',
        name: 'Unknown',
        email: 'unknown@example.com'
      },
      community: item.community ? {
        _id: item.community._id.toString(),
        name: item.community.name,
        slug: item.community.slug
      } : undefined,
      status: item.status,
      priority: item.priority,
      reviewer: item.reviewer ? {
        _id: item.reviewer._id.toString(),
        name: item.reviewer.name,
        email: item.reviewer.email
      } : undefined,
      reviewedAt: item.reviewedAt,
      reviewNotes: item.reviewNotes,
      rejectionReasons: item.rejectionReasons,
      submittedAt: item.submittedAt,
      escalatedAt: item.escalatedAt,
      escalationReason: item.escalationReason,
      contentSnapshot: item.contentSnapshot,
      reportCount: item.reportCount,
      autoModerationScore: item.autoModerationScore,
      autoModerationFlags: item.autoModerationFlags,
      requiresManualReview: item.requiresManualReview,
      reviewDeadline: item.reviewDeadline,
      tags: item.tags || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private sanitizeFilters(filters: ContentModerationFiltersDto): Record<string, any> {
    const { page, limit, ...sanitized } = filters;
    return sanitized;
  }

  private getModerationAuditAction(action: ModerationStatus): AdminAction {
    switch (action) {
      case ModerationStatus.APPROVED:
        return AdminAction.CONTENT_APPROVE;
      case ModerationStatus.REJECTED:
        return AdminAction.CONTENT_REJECT;
      case ModerationStatus.FLAGGED:
        return AdminAction.CONTENT_FLAG;
      case ModerationStatus.ESCALATED:
        return AdminAction.CONTENT_ESCALATE;
      default:
        return AdminAction.CONTENT_MODERATE;
    }
  }

  private async handleContentModerationDecision(item: ContentModerationQueueDocument, action: ModerationStatus): Promise<void> {
    try {
      const contentId = item.contentId;
      const contentType = item.contentType;
      
      this.logger.log(`Processing content ${contentId} (${contentType}) moderation action: ${action}`);

      // Integrate with actual content services based on content type
      switch (contentType) {
        case ContentType.POST:
          await this.handlePostModeration(contentId, action);
          break;
        case ContentType.COURSE:
          await this.handleCourseModeration(contentId, action);
          break;
        case ContentType.EVENT:
          await this.handleEventModeration(contentId, action);
          break;
        case ContentType.PRODUCT:
          await this.handleProductModeration(contentId, action);
          break;
        default:
          this.logger.warn(`Unknown content type: ${contentType}, skipping external service integration`);
      }

      this.logger.log(`Content ${contentId} (${contentType}) moderation decision completed: ${action}`);
    } catch (error) {
      this.logger.error(`Error handling content moderation decision for ${item.contentId}`, error);
      // Don't throw - the moderation decision is still recorded even if external service call fails
    }
  }

  /**
   * Handle post moderation - update post visibility/status
   */
  private async handlePostModeration(contentId: Types.ObjectId, action: ModerationStatus): Promise<void> {
    const post = await this.postModel.findById(contentId).exec();
    
    if (!post) {
      this.logger.warn(`Post ${contentId} not found for moderation`);
      return;
    }

    switch (action) {
      case ModerationStatus.APPROVED:
        // Post is approved - it's already visible, just log the approval
        this.logger.log(`Post ${contentId} approved and remains visible`);
        break;
      case ModerationStatus.REJECTED:
        // For posts, we could soft delete or mark as hidden
        // Since there's no status field, we'll log the rejection
        this.logger.log(`Post ${contentId} rejected - should be hidden from users`);
        // In a full implementation, you might want to:
        // await this.postModel.updateOne({ _id: contentId }, { $set: { isVisible: false } });
        break;
      case ModerationStatus.FLAGGED:
        this.logger.log(`Post ${contentId} flagged for review`);
        break;
      case ModerationStatus.ESCALATED:
        this.logger.log(`Post ${contentId} escalated to senior moderator`);
        break;
    }
  }

  /**
   * Handle course moderation
   */
  private async handleCourseModeration(contentId: Types.ObjectId, action: ModerationStatus): Promise<void> {
    const course = await this.courseModel.findById(contentId).exec();
    
    if (!course) {
      this.logger.warn(`Course ${contentId} not found for moderation`);
      return;
    }

    switch (action) {
      case ModerationStatus.APPROVED:
        this.logger.log(`Course ${contentId} approved`);
        break;
      case ModerationStatus.REJECTED:
        this.logger.log(`Course ${contentId} rejected - should be unpublished`);
        break;
      case ModerationStatus.FLAGGED:
        this.logger.log(`Course ${contentId} flagged for review`);
        break;
      case ModerationStatus.ESCALATED:
        this.logger.log(`Course ${contentId} escalated`);
        break;
    }
  }

  /**
   * Handle event moderation
   */
  private async handleEventModeration(contentId: Types.ObjectId, action: ModerationStatus): Promise<void> {
    const event = await this.eventModel.findById(contentId).exec();
    
    if (!event) {
      this.logger.warn(`Event ${contentId} not found for moderation`);
      return;
    }

    switch (action) {
      case ModerationStatus.APPROVED:
        this.logger.log(`Event ${contentId} approved`);
        break;
      case ModerationStatus.REJECTED:
        this.logger.log(`Event ${contentId} rejected - should be unpublished`);
        break;
      case ModerationStatus.FLAGGED:
        this.logger.log(`Event ${contentId} flagged for review`);
        break;
      case ModerationStatus.ESCALATED:
        this.logger.log(`Event ${contentId} escalated`);
        break;
    }
  }

  /**
   * Handle product moderation
   */
  private async handleProductModeration(contentId: Types.ObjectId, action: ModerationStatus): Promise<void> {
    const product = await this.productModel.findById(contentId).exec();
    
    if (!product) {
      this.logger.warn(`Product ${contentId} not found for moderation`);
      return;
    }

    switch (action) {
      case ModerationStatus.APPROVED:
        this.logger.log(`Product ${contentId} approved`);
        break;
      case ModerationStatus.REJECTED:
        this.logger.log(`Product ${contentId} rejected - should be unpublished`);
        break;
      case ModerationStatus.FLAGGED:
        this.logger.log(`Product ${contentId} flagged for review`);
        break;
      case ModerationStatus.ESCALATED:
        this.logger.log(`Product ${contentId} escalated`);
        break;
    }
  }

  private async sendModerationNotifications(item: ContentModerationQueueDocument, action: ModerationStatus): Promise<void> {
    try {
      // For now, we'll use the system alert method since the service doesn't have a generic sendNotification method
      // In a real implementation, you would integrate with the actual notification system
      
      const actionText = action.toLowerCase().replace('_', ' ');
      const title = `Content Moderation Update`;
      const message = `Content ${item.contentType} has been ${actionText}`;
      
      await this.adminNotificationService.sendSystemAlert(
        title,
        message,
        'low' as any, // AlertSeverity.LOW
        {
          contentId: item.contentId.toString(),
          contentType: item.contentType,
          moderationAction: action,
          reviewNotes: item.reviewNotes,
          creatorId: item.creatorId.toString()
        }
      );

      this.logger.log(`Moderation notification sent for content ${item.contentId}`);
    } catch (error) {
      this.logger.error('Error sending moderation notifications', error);
      // Don't throw - notifications are not critical for moderation workflow
    }
  }

  private async fetchContentData(contentId: Types.ObjectId, contentType: ContentType): Promise<any> {
    // This would fetch actual content data from respective services
    // For now, return placeholder data
    return {
      title: `Sample ${contentType} title`,
      description: `Sample ${contentType} description`,
      content: `Sample ${contentType} content`,
      images: [],
      videos: [],
      metadata: {}
    };
  }

  private async fetchEngagementMetrics(contentId: Types.ObjectId, contentType: ContentType): Promise<any> {
    // This would fetch actual engagement metrics
    // For now, return placeholder data
    return {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0
    };
  }

  private async fetchUserReports(contentId: Types.ObjectId): Promise<any[]> {
    // This would fetch actual user reports
    // For now, return empty array
    return [];
  }

  private async getCountsByField(field: string): Promise<Record<string, number>> {
    const pipeline = [
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $project: { _id: 0, [field]: '$_id', count: 1 } }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    const counts: Record<string, number> = {};
    
    results.forEach(result => {
      counts[result[field]] = result.count;
    });

    return counts;
  }

  private async getProcessedCount(period: 'today' | 'week'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return this.contentModerationModel.countDocuments({
      reviewedAt: { $gte: startDate },
      status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
    }).exec();
  }

  /**
   * Get comprehensive content moderation analytics
   */
  async getContentModerationAnalytics(
    filters: ContentModerationAnalyticsFiltersDto
  ): Promise<ContentModerationAnalyticsDto> {
    try {
      const dateRange = this.getDateRangeFromPeriod((filters.period || TimePeriod.LAST_30_DAYS) as TimePeriod, filters.startDate, filters.endDate);
      
      const [
        engagementMetrics,
        performanceMetrics,
        qualityMetrics
      ] = await Promise.all([
        this.getContentEngagementMetrics(dateRange, filters),
        this.getModerationPerformanceMetrics(dateRange, filters),
        this.getContentQualityMetrics(dateRange, filters)
      ]);

      const kpis = this.calculateKPIs(engagementMetrics, performanceMetrics, qualityMetrics);
      const insights = this.generateInsights(engagementMetrics, performanceMetrics, qualityMetrics);
      const recommendations = this.generateRecommendations(engagementMetrics, performanceMetrics, qualityMetrics);

      return {
        period: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          label: this.getPeriodLabel((filters.period || TimePeriod.LAST_30_DAYS) as TimePeriod, dateRange)
        },
        engagementMetrics,
        performanceMetrics,
        qualityMetrics,
        kpis,
        insights,
        recommendations
      };
    } catch (error) {
      this.logger.error('Error generating content moderation analytics', error);
      throw error;
    }
  }

  /**
   * Get content engagement metrics
   */
  async getContentEngagementMetrics(
    dateRange: { startDate: Date; endDate: Date },
    filters: ContentModerationAnalyticsFiltersDto
  ): Promise<ContentEngagementMetricsDto> {
    try {
      const baseQuery = this.buildAnalyticsQuery(dateRange, filters);
      
      const [
        totalProcessed,
        statusCounts,
        processingTimes,
        contentTypeStats,
        reportStats,
        engagementData
      ] = await Promise.all([
        this.contentModerationModel.countDocuments({
          ...baseQuery,
          status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
        }).exec(),
        this.getStatusCounts(baseQuery),
        this.getProcessingTimes(baseQuery),
        this.getContentTypeStats(baseQuery),
        this.getReportStats(baseQuery),
        this.getEngagementData(baseQuery)
      ]);

      const approvalRate = totalProcessed > 0 ? (statusCounts[ModerationStatus.APPROVED] || 0) / totalProcessed * 100 : 0;
      const rejectionRate = totalProcessed > 0 ? (statusCounts[ModerationStatus.REJECTED] || 0) / totalProcessed * 100 : 0;
      const flaggingRate = totalProcessed > 0 ? (statusCounts[ModerationStatus.FLAGGED] || 0) / totalProcessed * 100 : 0;
      const escalationRate = totalProcessed > 0 ? (statusCounts[ModerationStatus.ESCALATED] || 0) / totalProcessed * 100 : 0;

      return {
        totalProcessed,
        averageProcessingTime: processingTimes.average,
        approvalRate: Math.round(approvalRate * 100) / 100,
        rejectionRate: Math.round(rejectionRate * 100) / 100,
        flaggingRate: Math.round(flaggingRate * 100) / 100,
        escalationRate: Math.round(escalationRate * 100) / 100,
        averageEngagementScore: engagementData.averageScore,
        qualityScore: this.calculateQualityScore(approvalRate, reportStats.reportRate, engagementData.averageScore),
        reportRate: reportStats.reportRate,
        falsePositiveRate: reportStats.falsePositiveRate,
        contentTypeBreakdown: contentTypeStats,
        trendingCategories: await this.getTrendingCategories(dateRange, filters)
      };
    } catch (error) {
      this.logger.error('Error calculating content engagement metrics', error);
      throw error;
    }
  }

  /**
   * Get moderation performance metrics
   */
  async getModerationPerformanceMetrics(
    dateRange: { startDate: Date; endDate: Date },
    filters: ContentModerationAnalyticsFiltersDto
  ): Promise<ModerationPerformanceDto> {
    try {
      const baseQuery = this.buildAnalyticsQuery(dateRange, filters);
      
      const [
        moderatorStats,
        processingDistribution,
        workloadByDay,
        peakHours
      ] = await Promise.all([
        this.getModeratorStats(baseQuery),
        this.getProcessingTimeDistribution(baseQuery),
        this.getWorkloadByDay(baseQuery),
        this.getPeakProcessingHours(baseQuery)
      ]);

      const totalModerators = moderatorStats.length;
      const totalItems = moderatorStats.reduce((sum, mod) => sum + mod.itemsProcessed, 0);
      const averageItemsPerModerator = totalModerators > 0 ? totalItems / totalModerators : 0;

      const fastestModerator = moderatorStats.reduce((fastest, current) => 
        current.averageProcessingTime < fastest.averageProcessingTime ? current : fastest,
        moderatorStats[0] || { moderatorId: '', moderatorName: '', averageTime: 0, itemsProcessed: 0 }
      );

      const mostProductiveModerator = moderatorStats.reduce((mostProductive, current) => 
        current.itemsProcessed > mostProductive.itemsProcessed ? current : mostProductive,
        moderatorStats[0] || { moderatorId: '', moderatorName: '', itemsProcessed: 0, accuracyRate: 0 }
      );

      return {
        totalModerators,
        averageItemsPerModerator: Math.round(averageItemsPerModerator * 100) / 100,
        fastestModerator: {
          moderatorId: fastestModerator.moderatorId,
          moderatorName: fastestModerator.moderatorName,
          averageTime: fastestModerator.averageProcessingTime,
          itemsProcessed: fastestModerator.itemsProcessed
        },
        mostProductiveModerator: {
          moderatorId: mostProductiveModerator.moderatorId,
          moderatorName: mostProductiveModerator.moderatorName,
          itemsProcessed: mostProductiveModerator.itemsProcessed,
          accuracyRate: mostProductiveModerator.accuracyRate
        },
        moderatorPerformance: moderatorStats,
        processingTimeDistribution: processingDistribution,
        workloadByDay,
        peakHours
      };
    } catch (error) {
      this.logger.error('Error calculating moderation performance metrics', error);
      throw error;
    }
  }

  /**
   * Get content quality metrics
   */
  async getContentQualityMetrics(
    dateRange: { startDate: Date; endDate: Date },
    filters: ContentModerationAnalyticsFiltersDto
  ): Promise<ContentQualityMetricsDto> {
    try {
      const baseQuery = this.buildAnalyticsQuery(dateRange, filters);
      
      const [
        qualityScores,
        autoModerationStats,
        rejectionReasons,
        creatorQualityStats,
        repeatOffenders,
        improvementSuggestions
      ] = await Promise.all([
        this.getQualityScores(baseQuery),
        this.getAutoModerationStats(baseQuery),
        this.getRejectionReasons(baseQuery),
        this.getCreatorQualityDistribution(baseQuery),
        this.getRepeatOffenders(baseQuery),
        this.getImprovementSuggestions(baseQuery)
      ]);

      return {
        overallQualityScore: qualityScores.overall,
        qualityTrend: qualityScores.trend,
        autoModerationAccuracy: autoModerationStats.accuracy,
        manualReviewRate: autoModerationStats.manualReviewRate,
        qualityByType: qualityScores.byType,
        rejectionReasons,
        creatorQualityDistribution: creatorQualityStats,
        repeatOffenders,
        improvementSuggestions
      };
    } catch (error) {
      this.logger.error('Error calculating content quality metrics', error);
      throw error;
    }
  }

  // Analytics helper methods

  private getDateRangeFromPeriod(
    period: TimePeriod, 
    customStartDate?: string, 
    customEndDate?: string
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case TimePeriod.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_YEAR:
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.CUSTOM:
        if (!customStartDate || !customEndDate) {
          throw new BadRequestException('Custom date range requires both startDate and endDate');
        }
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private buildAnalyticsQuery(
    dateRange: { startDate: Date; endDate: Date },
    filters: ContentModerationAnalyticsFiltersDto
  ): FilterQuery<ContentModerationQueueDocument> {
    const query: FilterQuery<ContentModerationQueueDocument> = {
      submittedAt: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      }
    };

    if (filters.contentType) {
      query.contentType = filters.contentType;
    }

    if (filters.communityId) {
      query.communityId = new Types.ObjectId(filters.communityId);
    }

    if (filters.moderatorId) {
      query.reviewedBy = new Types.ObjectId(filters.moderatorId);
    }

    return query;
  }

  private async getStatusCounts(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<Record<string, number>> {
    const pipeline = [
      { $match: baseQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    const counts: Record<string, number> = {};
    
    results.forEach(result => {
      counts[result._id] = result.count;
    });

    return counts;
  }

  private async getProcessingTimes(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<{ average: number; median: number }> {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          reviewedAt: { $exists: true },
          status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
        }
      },
      {
        $project: {
          processingTime: {
            $divide: [
              { $subtract: ['$reviewedAt', '$submittedAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgProcessingTime: { $avg: '$processingTime' },
          times: { $push: '$processingTime' }
        }
      }
    ];

    const result = await this.contentModerationModel.aggregate(pipeline).exec();
    if (result.length === 0) {
      return { average: 0, median: 0 };
    }

    const times = result[0].times.sort((a: number, b: number) => a - b);
    const median = times.length % 2 === 0 
      ? (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : times[Math.floor(times.length / 2)];

    return {
      average: Math.round(result[0].avgProcessingTime * 100) / 100,
      median: Math.round(median * 100) / 100
    };
  }

  private async getContentTypeStats(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<Record<ContentType, any>> {
    const pipeline = [
      { $match: baseQuery },
      {
        $group: {
          _id: '$contentType',
          count: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', ModerationStatus.APPROVED] }, 1, 0] }
          },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$reviewedAt', null] }, { $ne: ['$submittedAt', null] }] },
                { $divide: [{ $subtract: ['$reviewedAt', '$submittedAt'] }, 1000 * 60 * 60] },
                null
              ]
            }
          }
        }
      }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    const stats: Record<ContentType, any> = {} as Record<ContentType, any>;

    results.forEach(result => {
      stats[result._id as ContentType] = {
        count: result.count,
        approvalRate: result.count > 0 ? (result.approved / result.count) * 100 : 0,
        averageProcessingTime: result.avgProcessingTime || 0
      };
    });

    return stats;
  }

  private async getReportStats(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<{ reportRate: number; falsePositiveRate: number }> {
    const [totalItems, reportedItems, falsePositives] = await Promise.all([
      this.contentModerationModel.countDocuments(baseQuery).exec(),
      this.contentModerationModel.countDocuments({ ...baseQuery, reportCount: { $gt: 0 } }).exec(),
      this.contentModerationModel.countDocuments({
        ...baseQuery,
        reportCount: { $gt: 0 },
        status: ModerationStatus.APPROVED
      }).exec()
    ]);

    const reportRate = totalItems > 0 ? (reportedItems / totalItems) * 100 : 0;
    const falsePositiveRate = reportedItems > 0 ? (falsePositives / reportedItems) * 100 : 0;

    return {
      reportRate: Math.round(reportRate * 100) / 100,
      falsePositiveRate: Math.round(falsePositiveRate * 100) / 100
    };
  }

  private async getEngagementData(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<{ averageScore: number }> {
    // This would integrate with actual engagement metrics from content services
    // For now, return placeholder data
    return { averageScore: 75 };
  }

  private async getTrendingCategories(
    dateRange: { startDate: Date; endDate: Date },
    filters: ContentModerationAnalyticsFiltersDto
  ): Promise<Array<{ category: string; count: number; growthRate: number }>> {
    // This would analyze content tags and categories for trends
    // For now, return placeholder data
    return [
      { category: 'Educational', count: 150, growthRate: 15.5 },
      { category: 'Entertainment', count: 120, growthRate: 8.2 },
      { category: 'Technology', count: 95, growthRate: 22.1 }
    ];
  }

  private calculateQualityScore(approvalRate: number, reportRate: number, engagementScore: number): number {
    // Weighted quality score calculation
    const approvalWeight = 0.4;
    const reportWeight = 0.3; // Lower report rate = higher quality
    const engagementWeight = 0.3;

    const normalizedReportRate = Math.max(0, 100 - reportRate); // Invert report rate
    const qualityScore = (approvalRate * approvalWeight) + 
                        (normalizedReportRate * reportWeight) + 
                        (engagementScore * engagementWeight);

    return Math.round(qualityScore * 100) / 100;
  }

  private async getModeratorStats(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any[]> {
    const pipeline: any[] = [
      {
        $match: {
          ...baseQuery,
          reviewedBy: { $exists: true },
          status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
        }
      },
      {
        $group: {
          _id: '$reviewedBy',
          itemsProcessed: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', ModerationStatus.APPROVED] }, 1, 0] } },
          escalated: { $sum: { $cond: [{ $eq: ['$status', ModerationStatus.ESCALATED] }, 1, 0] } },
          avgProcessingTime: {
            $avg: {
              $divide: [{ $subtract: ['$reviewedAt', '$submittedAt'] }, 1000 * 60 * 60]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'adminusers',
          localField: '_id',
          foreignField: '_id',
          as: 'moderator'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'moderator.userId',
          foreignField: '_id',
          as: 'user'
        }
      }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    
    return results.map(result => ({
      moderatorId: result._id.toString(),
      moderatorName: result.user[0]?.name || 'Unknown',
      itemsProcessed: result.itemsProcessed,
      averageProcessingTime: Math.round(result.avgProcessingTime * 100) / 100,
      approvalRate: result.itemsProcessed > 0 ? (result.approved / result.itemsProcessed) * 100 : 0,
      accuracyScore: this.calculateModeratorAccuracy(result),
      escalationRate: result.itemsProcessed > 0 ? (result.escalated / result.itemsProcessed) * 100 : 0
    }));
  }

  private calculateModeratorAccuracy(moderatorData: any): number {
    // This would calculate accuracy based on appeals, reversals, etc.
    // For now, use approval rate as a proxy
    const approvalRate = moderatorData.itemsProcessed > 0 ? (moderatorData.approved / moderatorData.itemsProcessed) * 100 : 0;
    return Math.round(approvalRate * 100) / 100;
  }

  private async getProcessingTimeDistribution(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any> {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          reviewedAt: { $exists: true },
          status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
        }
      },
      {
        $project: {
          processingTimeHours: {
            $divide: [{ $subtract: ['$reviewedAt', '$submittedAt'] }, 1000 * 60 * 60]
          }
        }
      },
      {
        $group: {
          _id: null,
          under1Hour: { $sum: { $cond: [{ $lt: ['$processingTimeHours', 1] }, 1, 0] } },
          under4Hours: { $sum: { $cond: [{ $and: [{ $gte: ['$processingTimeHours', 1] }, { $lt: ['$processingTimeHours', 4] }] }, 1, 0] } },
          under24Hours: { $sum: { $cond: [{ $and: [{ $gte: ['$processingTimeHours', 4] }, { $lt: ['$processingTimeHours', 24] }] }, 1, 0] } },
          over24Hours: { $sum: { $cond: [{ $gte: ['$processingTimeHours', 24] }, 1, 0] } }
        }
      }
    ];

    const result = await this.contentModerationModel.aggregate(pipeline).exec();
    return result[0] || { under1Hour: 0, under4Hours: 0, under24Hours: 0, over24Hours: 0 };
  }

  private async getWorkloadByDay(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<Record<string, number>> {
    const pipeline = [
      { $match: baseQuery },
      {
        $group: {
          _id: { $dayOfWeek: '$submittedAt' },
          count: { $sum: 1 }
        }
      }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workload: Record<string, number> = {};

    dayNames.forEach((day, index) => {
      workload[day] = 0;
    });

    results.forEach(result => {
      const dayName = dayNames[result._id - 1]; // MongoDB dayOfWeek is 1-based
      workload[dayName] = result.count;
    });

    return workload;
  }

  private async getPeakProcessingHours(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<Array<{ hour: number; itemsProcessed: number }>> {
    const pipeline: any[] = [
      {
        $match: {
          ...baseQuery,
          reviewedAt: { $exists: true }
        }
      },
      {
        $group: {
          _id: { $hour: '$reviewedAt' },
          itemsProcessed: { $sum: 1 }
        }
      },
      { $sort: { itemsProcessed: -1 } },
      { $limit: 5 }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    return results.map(result => ({
      hour: result._id,
      itemsProcessed: result.itemsProcessed
    }));
  }

  private async getQualityScores(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any> {
    // This would calculate comprehensive quality scores
    // For now, return placeholder data
    return {
      overall: 82.5,
      trend: 5.2,
      byType: {
        [ContentType.POST]: { qualityScore: 85, reportRate: 2.1, approvalRate: 92, averageEngagement: 78 },
        [ContentType.COURSE]: { qualityScore: 88, reportRate: 1.5, approvalRate: 95, averageEngagement: 85 },
        [ContentType.EVENT]: { qualityScore: 80, reportRate: 3.2, approvalRate: 88, averageEngagement: 72 }
      }
    };
  }

  private async getAutoModerationStats(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any> {
    const [totalItems, autoModerated, manualReview] = await Promise.all([
      this.contentModerationModel.countDocuments(baseQuery).exec(),
      this.contentModerationModel.countDocuments({ ...baseQuery, autoModerationScore: { $exists: true } }).exec(),
      this.contentModerationModel.countDocuments({ ...baseQuery, requiresManualReview: true }).exec()
    ]);

    return {
      accuracy: totalItems > 0 ? (autoModerated / totalItems) * 100 : 0,
      manualReviewRate: totalItems > 0 ? (manualReview / totalItems) * 100 : 0
    };
  }

  private async getRejectionReasons(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any[]> {
    const pipeline: any[] = [
      {
        $match: {
          ...baseQuery,
          status: ModerationStatus.REJECTED,
          rejectionReasons: { $exists: true, $ne: [] }
        }
      },
      { $unwind: '$rejectionReasons' },
      {
        $group: {
          _id: '$rejectionReasons',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    const total = results.reduce((sum, item) => sum + item.count, 0);

    return results.map(result => ({
      reason: result._id,
      count: result.count,
      percentage: total > 0 ? (result.count / total) * 100 : 0,
      trend: 0 // Would calculate trend from historical data
    }));
  }

  private async getCreatorQualityDistribution(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any> {
    const pipeline = [
      { $match: baseQuery },
      {
        $group: {
          _id: '$creatorId',
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', ModerationStatus.APPROVED] }, 1, 0] } }
        }
      },
      {
        $project: {
          approvalRate: { $divide: ['$approved', '$total'] }
        }
      },
      {
        $group: {
          _id: null,
          highQuality: { $sum: { $cond: [{ $gte: ['$approvalRate', 0.9] }, 1, 0] } },
          mediumQuality: { $sum: { $cond: [{ $and: [{ $gte: ['$approvalRate', 0.7] }, { $lt: ['$approvalRate', 0.9] }] }, 1, 0] } },
          lowQuality: { $sum: { $cond: [{ $lt: ['$approvalRate', 0.7] }, 1, 0] } }
        }
      }
    ];

    const result = await this.contentModerationModel.aggregate(pipeline).exec();
    return result[0] || { highQuality: 0, mediumQuality: 0, lowQuality: 0 };
  }

  private async getRepeatOffenders(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any[]> {
    const pipeline: any[] = [
      {
        $match: {
          ...baseQuery,
          status: ModerationStatus.REJECTED
        }
      },
      {
        $group: {
          _id: '$creatorId',
          rejectionCount: { $sum: 1 },
          total: { $sum: 1 },
          lastRejectionDate: { $max: '$reviewedAt' }
        }
      },
      {
        $match: {
          rejectionCount: { $gte: 3 } // 3 or more rejections
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $sort: { rejectionCount: -1 } },
      { $limit: 10 }
    ];

    const results = await this.contentModerationModel.aggregate(pipeline).exec();
    
    return results.map(result => ({
      creatorId: result._id.toString(),
      creatorName: result.creator[0]?.name || 'Unknown',
      rejectionCount: result.rejectionCount,
      rejectionRate: 100, // All items in this query are rejections
      lastRejectionDate: result.lastRejectionDate
    }));
  }

  private async getImprovementSuggestions(baseQuery: FilterQuery<ContentModerationQueueDocument>): Promise<any[]> {
    // This would analyze patterns and generate suggestions
    // For now, return static suggestions
    return [
      {
        category: 'Content Quality',
        suggestion: 'Implement content quality guidelines for creators',
        impact: 'high' as const,
        affectedContent: 150
      },
      {
        category: 'Processing Time',
        suggestion: 'Add more moderators during peak hours',
        impact: 'medium' as const,
        affectedContent: 75
      }
    ];
  }

  private calculateKPIs(
    engagement: ContentEngagementMetricsDto,
    performance: ModerationPerformanceDto,
    quality: ContentQualityMetricsDto
  ): any {
    return {
      totalContentProcessed: engagement.totalProcessed,
      averageProcessingTime: engagement.averageProcessingTime,
      overallApprovalRate: engagement.approvalRate,
      moderatorEfficiency: performance.averageItemsPerModerator,
      contentQualityScore: quality.overallQualityScore,
      userSatisfactionScore: 100 - engagement.reportRate // Inverse of report rate
    };
  }

  private generateInsights(
    engagement: ContentEngagementMetricsDto,
    performance: ModerationPerformanceDto,
    quality: ContentQualityMetricsDto
  ): any[] {
    const insights: any[] = [];

    if (engagement.approvalRate > 90) {
      insights.push({
        type: 'positive' as const,
        title: 'High Approval Rate',
        description: 'Content approval rate is above 90%, indicating good content quality',
        metric: 'Approval Rate',
        value: engagement.approvalRate,
        change: 2.5
      });
    }

    if (engagement.averageProcessingTime > 24) {
      insights.push({
        type: 'negative' as const,
        title: 'Slow Processing Time',
        description: 'Average processing time exceeds 24 hours, consider adding more moderators',
        metric: 'Processing Time',
        value: engagement.averageProcessingTime,
        change: -5.2
      });
    }

    return insights;
  }

  private generateRecommendations(
    engagement: ContentEngagementMetricsDto,
    performance: ModerationPerformanceDto,
    quality: ContentQualityMetricsDto
  ): any[] {
    const recommendations: any[] = [];

    if (engagement.averageProcessingTime > 12) {
      recommendations.push({
        priority: 'high' as const,
        category: 'Performance',
        title: 'Reduce Processing Time',
        description: 'Consider adding more moderators or implementing automated pre-screening',
        expectedImpact: 'Reduce processing time by 30-40%'
      });
    }

    if (quality.overallQualityScore < 80) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'Quality',
        title: 'Improve Content Quality',
        description: 'Implement creator education programs and clearer content guidelines',
        expectedImpact: 'Increase quality score by 10-15 points'
      });
    }

    return recommendations;
  }

  private getPeriodLabel(period: TimePeriod, dateRange: { startDate: Date; endDate: Date }): string {
    switch (period) {
      case TimePeriod.LAST_7_DAYS:
        return 'Last 7 Days';
      case TimePeriod.LAST_30_DAYS:
        return 'Last 30 Days';
      case TimePeriod.LAST_90_DAYS:
        return 'Last 90 Days';
      case TimePeriod.LAST_YEAR:
        return 'Last Year';
      case TimePeriod.CUSTOM:
        return `${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`;
      default:
        return 'Last 30 Days';
    }
  }

  private async calculateAverageProcessingTime(): Promise<number> {
    const pipeline = [
      {
        $match: {
          reviewedAt: { $exists: true },
          status: { $in: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED] }
        }
      },
      {
        $project: {
          processingTime: {
            $divide: [
              { $subtract: ['$reviewedAt', '$submittedAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgProcessingTime: { $avg: '$processingTime' }
        }
      }
    ];

    const result = await this.contentModerationModel.aggregate(pipeline).exec();
    return result.length > 0 ? Math.round(result[0].avgProcessingTime * 100) / 100 : 0;
  }
}
import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Param, 
  Body, 
  Query, 
  UseGuards, 
  Req,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery,
  ApiBearerAuth,
  ApiBody
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ContentModerationService } from './content-moderation.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminRoles } from '../common/decorators/admin-roles.decorator';
import { AuditContext } from '../common/decorators/audit-context.decorator';
import { AdminRole } from '../schemas/admin-user.schema';
import { AdminRequest, AdminResponse } from '../common/interfaces/admin-interfaces';
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
  ContentModerationAnalyticsDto
} from './dto/content-moderation-analytics.dto';

@ApiTags('Admin - Content Moderation')
@ApiBearerAuth()
@Controller('admin/content-moderation')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class ContentModerationController {
  private readonly logger = new Logger(ContentModerationController.name);

  constructor(
    private readonly contentModerationService: ContentModerationService
  ) {}

  @Get('queue')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Get content moderation queue',
    description: 'Retrieve paginated list of content items awaiting moderation with filtering options'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Moderation queue retrieved successfully',
    type: ContentModerationItemResponseDto,
    isArray: true
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized access' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions' })
  async getModerationQueue(
    @Query() filters: ContentModerationFiltersDto,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<ContentModerationItemResponseDto[]>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_MODERATION_QUEUE_VIEW' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId()
      };

      const result = await this.contentModerationService.getModerationQueue(filters, adminContext);

      return {
        success: true,
        message: 'Moderation queue retrieved successfully',
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      };
    } catch (error) {
      this.logger.error('Error retrieving moderation queue', error);
      return {
        success: false,
        message: 'Failed to retrieve moderation queue',
        error: {
          code: 'MODERATION_QUEUE_ERROR',
          details: error.message
        }
      };
    }
  }

  @Get('queue/stats')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({ 
    summary: 'Get moderation queue statistics',
    description: 'Retrieve comprehensive statistics about the content moderation queue'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Moderation statistics retrieved successfully',
    type: ModerationQueueStatsResponseDto
  })
  async getModerationStats(): Promise<AdminResponse<ModerationQueueStatsResponseDto>> {
    try {
      const stats = await this.contentModerationService.getModerationStats();

      return {
        success: true,
        message: 'Moderation statistics retrieved successfully',
        data: stats
      };
    } catch (error) {
      this.logger.error('Error retrieving moderation statistics', error);
      return {
        success: false,
        message: 'Failed to retrieve moderation statistics',
        error: {
          code: 'MODERATION_STATS_ERROR',
          details: error.message
        }
      };
    }
  }

  @Get('analytics')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN, AdminRole.ANALYTICS_VIEWER)
  @ApiOperation({ 
    summary: 'Get content moderation analytics',
    description: 'Retrieve comprehensive analytics about content moderation performance, quality metrics, and insights'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Content moderation analytics retrieved successfully',
    type: ContentModerationAnalyticsDto
  })
  async getContentModerationAnalytics(
    @Query() filters: ContentModerationAnalyticsFiltersDto
  ): Promise<AdminResponse<ContentModerationAnalyticsDto>> {
    try {
      const analytics = await this.contentModerationService.getContentModerationAnalytics(filters);

      return {
        success: true,
        message: 'Content moderation analytics retrieved successfully',
        data: analytics
      };
    } catch (error) {
      this.logger.error('Error retrieving content moderation analytics', error);
      return {
        success: false,
        message: 'Failed to retrieve content moderation analytics',
        error: {
          code: 'MODERATION_ANALYTICS_ERROR',
          details: error.message
        }
      };
    }
  }

  @Get('queue/:itemId')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Get detailed content information',
    description: 'Retrieve detailed information about a specific content item for moderation'
  })
  @ApiParam({ name: 'itemId', description: 'Content moderation queue item ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Content details retrieved successfully',
    type: ContentDetailsResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Content item not found' })
  async getContentDetails(
    @Param('itemId') itemId: string,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<ContentDetailsResponseDto>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_MODERATION_VIEW' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId)
      };

      const details = await this.contentModerationService.getContentDetails(itemId, adminContext);

      return {
        success: true,
        message: 'Content details retrieved successfully',
        data: details
      };
    } catch (error) {
      this.logger.error(`Error retrieving content details for item ${itemId}`, error);
      return {
        success: false,
        message: 'Failed to retrieve content details',
        error: {
          code: 'CONTENT_DETAILS_ERROR',
          details: error.message
        }
      };
    }
  }

  @Post('queue/:itemId/moderate')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Moderate content item',
    description: 'Approve, reject, flag, or escalate a content item in the moderation queue'
  })
  @ApiParam({ name: 'itemId', description: 'Content moderation queue item ID' })
  @ApiBody({ type: ModerateContentDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Content moderated successfully',
    type: ContentModerationItemResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Content item not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid moderation data' })
  async moderateContent(
    @Param('itemId') itemId: string,
    @Body() moderationData: ModerateContentDto,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<ContentModerationItemResponseDto>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_MODERATE' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId)
      };

      const result = await this.contentModerationService.moderateContent(itemId, moderationData, adminContext);

      return {
        success: true,
        message: `Content ${moderationData.action.toLowerCase()} successfully`,
        data: result
      };
    } catch (error) {
      this.logger.error(`Error moderating content item ${itemId}`, error);
      return {
        success: false,
        message: 'Failed to moderate content',
        error: {
          code: 'CONTENT_MODERATION_ERROR',
          details: error.message
        }
      };
    }
  }

  @Post('queue/bulk-moderate')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Bulk moderate content items',
    description: 'Apply the same moderation action to multiple content items simultaneously'
  })
  @ApiBody({ type: BulkModerateContentDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Bulk moderation completed',
    type: BulkModerationResponseDto
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid bulk moderation data' })
  async bulkModerateContent(
    @Body() bulkData: BulkModerateContentDto,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<BulkModerationResponseDto>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_BULK_MODERATE' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId()
      };

      const result = await this.contentModerationService.bulkModerateContent(bulkData, adminContext);

      return {
        success: true,
        message: result.summary,
        data: result
      };
    } catch (error) {
      this.logger.error('Error in bulk content moderation', error);
      return {
        success: false,
        message: 'Failed to perform bulk moderation',
        error: {
          code: 'BULK_MODERATION_ERROR',
          details: error.message
        }
      };
    }
  }

  @Put('queue/:itemId/priority')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Update content priority',
    description: 'Change the priority level of a content item in the moderation queue'
  })
  @ApiParam({ name: 'itemId', description: 'Content moderation queue item ID' })
  @ApiBody({ type: UpdateContentPriorityDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Content priority updated successfully',
    type: ContentModerationItemResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Content item not found' })
  async updateContentPriority(
    @Param('itemId') itemId: string,
    @Body() priorityData: UpdateContentPriorityDto,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<ContentModerationItemResponseDto>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_PRIORITY_UPDATE' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId)
      };

      const result = await this.contentModerationService.updateContentPriority(itemId, priorityData, adminContext);

      return {
        success: true,
        message: 'Content priority updated successfully',
        data: result
      };
    } catch (error) {
      this.logger.error(`Error updating content priority for item ${itemId}`, error);
      return {
        success: false,
        message: 'Failed to update content priority',
        error: {
          code: 'PRIORITY_UPDATE_ERROR',
          details: error.message
        }
      };
    }
  }

  @Post('queue/:itemId/assign')
  @RequireAdminRoles(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)
  @ApiOperation({ 
    summary: 'Assign content to moderator',
    description: 'Assign a content item to a specific moderator for review'
  })
  @ApiParam({ name: 'itemId', description: 'Content moderation queue item ID' })
  @ApiBody({ type: AssignContentDto })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Content assigned successfully',
    type: ContentModerationItemResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Content item not found' })
  async assignContent(
    @Param('itemId') itemId: string,
    @Body() assignmentData: AssignContentDto,
    @Req() req: AdminRequest
  ): Promise<AdminResponse<ContentModerationItemResponseDto>> {
    try {
      const adminContext = {
        adminUserId: req.adminUser._id,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        action: 'CONTENT_ASSIGNMENT' as any,
        entityType: 'ContentModerationQueue',
        entityId: new Types.ObjectId(itemId)
      };

      const result = await this.contentModerationService.assignContent(itemId, assignmentData, adminContext);

      return {
        success: true,
        message: 'Content assigned successfully',
        data: result
      };
    } catch (error) {
      this.logger.error(`Error assigning content item ${itemId}`, error);
      return {
        success: false,
        message: 'Failed to assign content',
        error: {
          code: 'CONTENT_ASSIGNMENT_ERROR',
          details: error.message
        }
      };
    }
  }
}
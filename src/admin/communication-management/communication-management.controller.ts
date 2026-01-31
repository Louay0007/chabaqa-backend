import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommunicationManagementService } from './communication-management.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminRoles } from '../common/decorators/admin-roles.decorator';
import { AdminRole } from '../schemas/admin-user.schema';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { BulkMessageDto } from './dto/bulk-message.dto';
import { CampaignFiltersDto } from './dto/campaign-filters.dto';
import {
  NotificationConfigDto,
  UpdateNotificationConfigDto,
} from './dto/notification-config.dto';
import {
  CommunicationMetricsDto,
  CampaignPerformanceDto,
  DeliveryStatusDto,
  EngagementStatisticsDto,
  CommunicationAnalyticsQueryDto,
} from './dto/communication-analytics.dto';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  TestEmailTemplateDto,
  TemplateCategory,
} from './dto/email-template.dto';

@ApiTags('Admin - Communication Management')
@ApiBearerAuth()
@Controller('admin/communication')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class CommunicationManagementController {
  constructor(
    private readonly communicationManagementService: CommunicationManagementService,
  ) {}

  @Post('campaigns')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create email campaign',
    description:
      'Create a new email campaign with template selection and audience targeting. Supports personalization and scheduling.',
  })
  @ApiResponse({
    status: 201,
    description: 'Email campaign created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data or no recipients found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async createEmailCampaign(
    @Body() dto: CreateEmailCampaignDto,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.createEmailCampaign(
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Post('bulk-message')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send bulk message',
    description:
      'Send bulk messages to targeted audience with personalization options. Supports email and in-app notifications.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk message sent successfully',
    schema: {
      type: 'object',
      properties: {
        sent: { type: 'number', example: 950 },
        failed: { type: 'number', example: 50 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data or no recipients found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async sendBulkMessage(@Body() dto: BulkMessageDto, @Req() req) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.sendBulkMessage(
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Get('campaigns')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get campaigns with filtering',
    description:
      'Retrieve paginated list of email campaigns with advanced filtering options including status, type, community, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Campaigns retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
        hasNextPage: { type: 'boolean' },
        hasPrevPage: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getCampaigns(@Query() filters: CampaignFiltersDto) {
    return await this.communicationManagementService.getCampaigns(filters);
  }

  @Get('analytics/metrics')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get communication metrics',
    description:
      'Retrieve comprehensive communication metrics including total campaigns, emails sent, open rates, click rates, and delivery statistics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Communication metrics retrieved successfully',
    type: CommunicationMetricsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getCommunicationMetrics(
    @Query() query: CommunicationAnalyticsQueryDto,
  ): Promise<CommunicationMetricsDto> {
    return await this.communicationManagementService.getCommunicationMetrics(
      query,
    );
  }

  @Get('analytics/campaign-performance')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get campaign performance details',
    description:
      'Retrieve detailed performance metrics for email campaigns including open rates, click-through rates, and delivery rates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Campaign performance retrieved successfully',
    type: [CampaignPerformanceDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getCampaignPerformance(
    @Query() query: CommunicationAnalyticsQueryDto,
  ): Promise<CampaignPerformanceDto[]> {
    return await this.communicationManagementService.getCampaignPerformance(
      query,
    );
  }

  @Get('analytics/delivery-status')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get delivery status tracking',
    description:
      'Retrieve delivery status for campaigns including pending, sent, failed, and bounced email counts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery status retrieved successfully',
    type: [DeliveryStatusDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getDeliveryStatus(
    @Query() query: CommunicationAnalyticsQueryDto,
  ): Promise<DeliveryStatusDto[]> {
    return await this.communicationManagementService.getDeliveryStatus(query);
  }

  @Get('analytics/engagement')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get engagement statistics',
    description:
      'Retrieve engagement statistics including unique engaged users, engagement rates, and best/worst performing campaigns.',
  })
  @ApiResponse({
    status: 200,
    description: 'Engagement statistics retrieved successfully',
    type: EngagementStatisticsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getEngagementStatistics(
    @Query() query: CommunicationAnalyticsQueryDto,
  ): Promise<EngagementStatisticsDto> {
    return await this.communicationManagementService.getEngagementStatistics(
      query,
    );
  }

  /**
   * Notification Management Endpoints
   */

  @Post('notifications/config')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create notification configuration',
    description:
      'Create a new notification type configuration with delivery method management and user preference settings.',
  })
  @ApiResponse({
    status: 201,
    description: 'Notification configuration created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Configuration with same name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async createNotificationConfig(
    @Body() dto: NotificationConfigDto,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.createNotificationConfig(
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Get('notifications/config')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get all notification configurations',
    description:
      'Retrieve all notification type configurations with delivery methods and settings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification configurations retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getNotificationConfigs() {
    return await this.communicationManagementService.getNotificationConfigs();
  }

  @Get('notifications/config/:id')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get notification configuration by ID',
    description: 'Retrieve a specific notification configuration by its ID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification configuration retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Notification configuration not found',
  })
  async getNotificationConfigById(@Param('id') id: string) {
    return await this.communicationManagementService.getNotificationConfigById(
      id,
    );
  }

  @Put('notifications/config/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update notification configuration',
    description:
      'Update an existing notification configuration including delivery methods and settings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification configuration updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Notification configuration not found',
  })
  async updateNotificationConfig(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationConfigDto,
    @Req() req,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.updateNotificationConfig(
      id,
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Delete('notifications/config/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete notification configuration',
    description: 'Delete a notification configuration.',
  })
  @ApiResponse({
    status: 204,
    description: 'Notification configuration deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Notification configuration not found',
  })
  async deleteNotificationConfig(@Param('id') id: string, @Req() req) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    await this.communicationManagementService.deleteNotificationConfig(
      id,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Get('notifications/users/:userId/preferences')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.USER_MANAGER,
  )
  @ApiOperation({
    summary: 'Get user notification preferences',
    description:
      'Retrieve notification preferences for a specific user including enabled types and quiet hours.',
  })
  @ApiResponse({
    status: 200,
    description: 'User notification preferences retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getUserNotificationPreferences(@Param('userId') userId: string) {
    return await this.communicationManagementService.getUserNotificationPreferences(
      userId,
    );
  }

  @Get('notifications/analytics/delivery-stats')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get notification delivery statistics',
    description:
      'Retrieve notification delivery statistics including total sent, read rates, and breakdown by type.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification delivery statistics retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getNotificationDeliveryStats(
    @Query() query: CommunicationAnalyticsQueryDto,
  ) {
    return await this.communicationManagementService.getNotificationDeliveryStats(
      query,
    );
  }

  /**
   * Email Template Management Endpoints
   */

  @Post('templates')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create email template',
    description:
      'Create a new email template with versioning support. Templates can include variables for personalization.',
  })
  @ApiResponse({
    status: 201,
    description: 'Email template created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Template with same name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async createEmailTemplate(
    @Body() dto: CreateEmailTemplateDto,
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.createEmailTemplate(
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Get('templates')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get all email templates',
    description:
      'Retrieve all email templates with optional filtering by category, active status, search term, and tags.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email templates retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getEmailTemplates(
    @Query('category') category?: TemplateCategory,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
  ) {
    const filters: any = {};
    if (category) filters.category = category;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (search) filters.search = search;
    if (tags) filters.tags = tags.split(',');

    return await this.communicationManagementService.getEmailTemplates(filters);
  }

  @Get('templates/:id')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get email template by ID',
    description: 'Retrieve a specific email template by its ID with full details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email template retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async getEmailTemplateById(@Param('id') id: string) {
    return await this.communicationManagementService.getEmailTemplateById(id);
  }

  @Put('templates/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @ApiOperation({
    summary: 'Update email template',
    description:
      'Update an existing email template. Content changes create new versions automatically.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email template updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async updateEmailTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.updateEmailTemplate(
      id,
      dto,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Delete('templates/:id')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete email template',
    description: 'Delete an email template permanently.',
  })
  @ApiResponse({
    status: 204,
    description: 'Email template deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async deleteEmailTemplate(@Param('id') id: string, @Req() req: any) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    await this.communicationManagementService.deleteEmailTemplate(
      id,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Get('templates/:id/versions')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Get template version history',
    description: 'Retrieve the complete version history of an email template.',
  })
  @ApiResponse({
    status: 200,
    description: 'Template version history retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async getTemplateVersionHistory(@Param('id') id: string) {
    return await this.communicationManagementService.getTemplateVersionHistory(id);
  }

  @Post('templates/:id/restore/:version')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @ApiOperation({
    summary: 'Restore template to specific version',
    description:
      'Restore an email template to a previous version. Creates a new version with the restored content.',
  })
  @ApiResponse({
    status: 200,
    description: 'Template restored successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template or version not found',
  })
  async restoreTemplateVersion(
    @Param('id') id: string,
    @Param('version') version: number,
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.restoreTemplateVersion(
      id,
      version,
      adminId,
      ipAddress,
      userAgent,
    );
  }

  @Post('templates/:id/preview')
  @RequireAdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.COMMUNITY_MANAGER,
    AdminRole.ANALYTICS_VIEWER,
  )
  @ApiOperation({
    summary: 'Preview template with test data',
    description:
      'Preview how an email template will look with specific test data applied to variables.',
  })
  @ApiResponse({
    status: 200,
    description: 'Template preview generated successfully',
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        content: { type: 'string' },
        variables: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async previewTemplate(
    @Param('id') id: string,
    @Body() testData?: Record<string, any>,
  ) {
    return await this.communicationManagementService.previewTemplate(id, testData);
  }

  @Post('templates/:id/test')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send test email with template',
    description:
      'Send a test email using the template with provided test data to verify appearance and functionality.',
  })
  @ApiResponse({
    status: 200,
    description: 'Test email sent successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async sendTestEmail(
    @Param('id') id: string,
    @Body() dto: TestEmailTemplateDto,
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    await this.communicationManagementService.sendTestEmail(
      id,
      dto,
      adminId,
      ipAddress,
      userAgent,
    );

    return { message: 'Test email sent successfully' };
  }

  @Post('templates/:id/duplicate')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMUNITY_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Duplicate email template',
    description:
      'Create a copy of an existing email template with a new name. The duplicated template starts as inactive.',
  })
  @ApiResponse({
    status: 201,
    description: 'Template duplicated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Template with new name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found - Email template not found',
  })
  async duplicateTemplate(
    @Param('id') id: string,
    @Body('newName') newName: string,
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    return await this.communicationManagementService.duplicateTemplate(
      id,
      newName,
      adminId,
      ipAddress,
      userAgent,
    );
  }
}

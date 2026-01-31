import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Req
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminPermissions } from '../common/decorators/admin-roles.decorator';
import { AdminPermission } from '../schemas/admin-user.schema';
import { AuditContext } from '../common/decorators/audit-context.decorator';
import { AdminAction } from '../schemas/audit-log.schema';
import { TimePeriod } from '../common/services/analytics.service';
import {
  AnalyticsPeriodDto,
  DashboardResponseDto,
  PlatformStatisticsDto,
  EngagementMetricsDto,
  RetentionAnalysisDto,
  AnalyticsExportDto
} from './dto/analytics-dashboard.dto';
import {
  CreateAlertDto,
  UpdateAlertDto,
  AlertResponseDto,
  AlertNotificationDto
} from './dto/alert-config.dto';

/**
 * AnalyticsDashboardController provides comprehensive analytics dashboard endpoints
 * Handles platform statistics, engagement metrics, retention analysis, and alert management
 */
@ApiTags('Admin - Analytics Dashboard')
@ApiBearerAuth()
@Controller('admin/analytics-dashboard')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class AnalyticsDashboardController {
  constructor(
    private readonly analyticsDashboardService: AnalyticsDashboardService
  ) {}

  /**
   * Get comprehensive dashboard data
   * Requirements: 5.1, 5.2, 5.3
   */
  @Get()
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'AnalyticsDashboard' })
  @ApiOperation({
    summary: 'Get Analytics Dashboard',
    description: 'Get comprehensive analytics dashboard with platform statistics, engagement metrics, and retention analysis'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for analytics period (ISO string)',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for analytics period (ISO string)',
    example: '2024-12-31T23:59:59.999Z'
  })
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Data granularity',
    example: 'month'
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    type: DashboardResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date parameters'
  })
  async getDashboard(
    @Query() periodDto: AnalyticsPeriodDto
  ): Promise<DashboardResponseDto> {
    try {
      const period = this.buildTimePeriod(periodDto);
      return await this.analyticsDashboardService.getDashboardData(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve dashboard data: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get platform-wide statistics
   * Requirements: 5.1
   */
  @Get('statistics')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'PlatformStatistics' })
  @ApiOperation({
    summary: 'Get Platform Statistics',
    description: 'Get platform-wide statistics including user counts, communities, content, and revenue'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for analytics period',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for analytics period',
    example: '2024-12-31T23:59:59.999Z'
  })
  @ApiResponse({
    status: 200,
    description: 'Platform statistics retrieved successfully',
    type: PlatformStatisticsDto
  })
  async getPlatformStatistics(
    @Query() periodDto: AnalyticsPeriodDto
  ): Promise<PlatformStatisticsDto> {
    try {
      const period = this.buildTimePeriod(periodDto);
      return await this.analyticsDashboardService.calculatePlatformStatistics(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve platform statistics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get engagement metrics
   * Requirements: 5.2
   */
  @Get('engagement')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'EngagementMetrics' })
  @ApiOperation({
    summary: 'Get Engagement Metrics',
    description: 'Get detailed engagement metrics including sessions, interactions, and participation'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for analytics period',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for analytics period',
    example: '2024-12-31T23:59:59.999Z'
  })
  @ApiResponse({
    status: 200,
    description: 'Engagement metrics retrieved successfully',
    type: EngagementMetricsDto
  })
  async getEngagementMetrics(
    @Query() periodDto: AnalyticsPeriodDto
  ): Promise<EngagementMetricsDto> {
    try {
      const period = this.buildTimePeriod(periodDto);
      return await this.analyticsDashboardService.getEngagementMetrics(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve engagement metrics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get retention analysis
   * Requirements: 5.3
   */
  @Get('retention')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'RetentionAnalysis' })
  @ApiOperation({
    summary: 'Get Retention Analysis',
    description: 'Get user retention analysis including cohort data and churn rates'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for analytics period',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for analytics period',
    example: '2024-12-31T23:59:59.999Z'
  })
  @ApiResponse({
    status: 200,
    description: 'Retention analysis retrieved successfully',
    type: RetentionAnalysisDto
  })
  async getRetentionAnalysis(
    @Query() periodDto: AnalyticsPeriodDto
  ): Promise<RetentionAnalysisDto> {
    try {
      const period = this.buildTimePeriod(periodDto);
      return await this.analyticsDashboardService.calculateRetentionAnalysis(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve retention analysis: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Export analytics data
   * Requirements: 5.6
   */
  @Post('export')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS, AdminPermission.EXPORT_DATA)
  @AuditContext({ action: AdminAction.DATA_EXPORT, entityType: 'AnalyticsData' })
  @ApiOperation({
    summary: 'Export Analytics Data',
    description: 'Export analytics data in specified format (CSV, Excel, PDF) with customizable fields'
  })
  @ApiResponse({
    status: 200,
    description: 'Export job created successfully',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        downloadUrl: { type: 'string' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid export parameters'
  })
  async exportAnalytics(
    @Body() exportDto: AnalyticsExportDto,
    @Req() req: any
  ): Promise<{ jobId: string; downloadUrl: string }> {
    try {
      const period = this.buildTimePeriod(exportDto);
      const format = exportDto.format || 'csv';
      const adminId = req.user?.id;
      
      return await this.analyticsDashboardService.exportAnalyticsData(
        period,
        format,
        exportDto.customFields,
        adminId
      );
    } catch (error) {
      throw new HttpException(
        `Failed to create export job: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Create alert configuration
   * Requirements: 5.5
   */
  @Post('alerts')
  @RequireAdminPermissions(AdminPermission.CONFIGURE_ALERTS)
  @AuditContext({ action: AdminAction.ALERT_CONFIGURE, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Create Alert',
    description: 'Create a new alert configuration with threshold and notification settings'
  })
  @ApiResponse({
    status: 201,
    description: 'Alert created successfully',
    type: AlertResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid alert configuration'
  })
  async createAlert(
    @Body() createAlertDto: CreateAlertDto,
    @Req() req: any
  ): Promise<AlertResponseDto> {
    try {
      const adminId = req.user?.id || 'admin-id';
      return await this.analyticsDashboardService.createAlert(createAlertDto, adminId);
    } catch (error) {
      throw new HttpException(
        `Failed to create alert: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get all alerts
   * Requirements: 5.5
   */
  @Get('alerts')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Get All Alerts',
    description: 'Get all configured alerts with their current status'
  })
  @ApiResponse({
    status: 200,
    description: 'Alerts retrieved successfully',
    type: [AlertResponseDto]
  })
  async getAlerts(): Promise<AlertResponseDto[]> {
    try {
      return await this.analyticsDashboardService.getAlerts();
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve alerts: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get alert by ID
   * Requirements: 5.5
   */
  @Get('alerts/:id')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Get Alert by ID',
    description: 'Get a specific alert configuration by ID'
  })
  @ApiParam({
    name: 'id',
    description: 'Alert ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiResponse({
    status: 200,
    description: 'Alert retrieved successfully',
    type: AlertResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Alert not found'
  })
  async getAlertById(@Param('id') id: string): Promise<AlertResponseDto> {
    try {
      return await this.analyticsDashboardService.getAlertById(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to retrieve alert: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Update alert configuration
   * Requirements: 5.5
   */
  @Put('alerts/:id')
  @RequireAdminPermissions(AdminPermission.CONFIGURE_ALERTS)
  @AuditContext({ action: AdminAction.ALERT_CONFIGURE, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Update Alert',
    description: 'Update an existing alert configuration'
  })
  @ApiParam({
    name: 'id',
    description: 'Alert ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiResponse({
    status: 200,
    description: 'Alert updated successfully',
    type: AlertResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Alert not found'
  })
  async updateAlert(
    @Param('id') id: string,
    @Body() updateAlertDto: UpdateAlertDto
  ): Promise<AlertResponseDto> {
    try {
      return await this.analyticsDashboardService.updateAlert(id, updateAlertDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to update alert: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Delete alert configuration
   * Requirements: 5.5
   */
  @Delete('alerts/:id')
  @RequireAdminPermissions(AdminPermission.CONFIGURE_ALERTS)
  @AuditContext({ action: AdminAction.ALERT_CONFIGURE, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Delete Alert',
    description: 'Delete an alert configuration'
  })
  @ApiParam({
    name: 'id',
    description: 'Alert ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiResponse({
    status: 200,
    description: 'Alert deleted successfully'
  })
  @ApiResponse({
    status: 404,
    description: 'Alert not found'
  })
  async deleteAlert(@Param('id') id: string): Promise<{ message: string }> {
    try {
      await this.analyticsDashboardService.deleteAlert(id);
      return { message: 'Alert deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to delete alert: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Check alerts and get triggered notifications
   * Requirements: 5.5
   */
  @Post('alerts/check')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Alert' })
  @ApiOperation({
    summary: 'Check Alerts',
    description: 'Check all enabled alerts against current metrics and return triggered alerts'
  })
  @ApiResponse({
    status: 200,
    description: 'Alerts checked successfully',
    type: [AlertNotificationDto]
  })
  async checkAlerts(): Promise<AlertNotificationDto[]> {
    try {
      return await this.analyticsDashboardService.checkAlerts();
    } catch (error) {
      throw new HttpException(
        `Failed to check alerts: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Helper method to build TimePeriod from DTO
   */
  private buildTimePeriod(periodDto: AnalyticsPeriodDto): TimePeriod {
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    let start: Date;
    let end: Date;

    try {
      start = periodDto.startDate ? new Date(periodDto.startDate) : defaultStartDate;
      end = periodDto.endDate ? new Date(periodDto.endDate) : now;
    } catch (error) {
      throw new Error('Invalid date format. Please use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }

    if (start >= end) {
      throw new Error('Start date must be before end date');
    }

    return {
      startDate: start,
      endDate: end,
      granularity: periodDto.granularity || 'day'
    };
  }
}

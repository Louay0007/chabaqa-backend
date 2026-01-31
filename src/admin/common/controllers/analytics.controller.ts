import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';
import { 
  AnalyticsService, 
  TimePeriod, 
  GrowthMetrics, 
  EngagementMetrics, 
  RevenueMetrics, 
  HealthMetrics,
  EngagementFilters
} from '../services/analytics.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { RequireAdminPermissions } from '../decorators/admin-roles.decorator';
import { AdminPermission } from '../../schemas/admin-user.schema';
import { AuditContext } from '../decorators/audit-context.decorator';
import { AdminAction } from '../../schemas/audit-log.schema';

/**
 * AnalyticsController provides admin analytics and reporting endpoints
 * Handles platform-wide metrics, user analytics, and performance monitoring
 */
@ApiTags('Admin - Analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get comprehensive dashboard metrics
   */
  @Get('dashboard')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Dashboard' })
  @ApiOperation({
    summary: 'Get Dashboard Metrics',
    description: 'Get comprehensive analytics dashboard data including user growth, engagement, revenue, and system health'
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
    description: 'Data granularity for time-based metrics',
    example: 'month'
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        userGrowth: { type: 'object' },
        engagement: { type: 'object' },
        revenue: { type: 'object' },
        health: { type: 'object' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date parameters'
  })
  async getDashboardMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month' | 'year'
  ): Promise<{
    userGrowth: GrowthMetrics;
    engagement: EngagementMetrics;
    revenue: RevenueMetrics;
    health: HealthMetrics;
  }> {
    try {
      const period = this.buildTimePeriod(startDate, endDate, granularity);
      const metrics = await this.analyticsService.getDashboardMetrics(period);
      
      return metrics;
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve dashboard metrics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get user growth metrics
   */
  @Get('user-growth')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'UserGrowth' })
  @ApiOperation({
    summary: 'Get User Growth Metrics',
    description: 'Get detailed user growth analytics including new users, active users, retention, and churn'
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
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Data granularity',
    example: 'month'
  })
  @ApiResponse({
    status: 200,
    description: 'User growth metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number' },
        newUsers: { type: 'number' },
        activeUsers: { type: 'number' },
        retainedUsers: { type: 'number' },
        churnedUsers: { type: 'number' },
        growthRate: { type: 'number' },
        period: { type: 'object' },
        dailyBreakdown: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  async getUserGrowthMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month' | 'year'
  ): Promise<GrowthMetrics> {
    try {
      const period = this.buildTimePeriod(startDate, endDate, granularity);
      return await this.analyticsService.calculateUserGrowth(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve user growth metrics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get engagement metrics
   */
  @Get('engagement')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Engagement' })
  @ApiOperation({
    summary: 'Get Engagement Metrics',
    description: 'Get user engagement analytics including sessions, page views, interactions, and community participation'
  })
  @ApiQuery({
    name: 'userSegment',
    required: false,
    description: 'Filter by user segment',
    example: 'premium'
  })
  @ApiQuery({
    name: 'contentType',
    required: false,
    description: 'Filter by content type',
    example: 'course'
  })
  @ApiQuery({
    name: 'communityId',
    required: false,
    description: 'Filter by community ID',
    example: '64a1b2c3d4e5f6789abcdef0'
  })
  @ApiQuery({
    name: 'deviceType',
    required: false,
    description: 'Filter by device type',
    example: 'mobile'
  })
  @ApiResponse({
    status: 200,
    description: 'Engagement metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalSessions: { type: 'number' },
        averageSessionDuration: { type: 'number' },
        pageViews: { type: 'number' },
        bounceRate: { type: 'number' },
        contentInteractions: { type: 'number' },
        communityParticipation: { type: 'number' },
        period: { type: 'object' }
      }
    }
  })
  async getEngagementMetrics(
    @Query('userSegment') userSegment?: string,
    @Query('contentType') contentType?: string,
    @Query('communityId') communityId?: string,
    @Query('deviceType') deviceType?: string
  ): Promise<EngagementMetrics> {
    try {
      const filters: EngagementFilters = {
        userSegment,
        contentType,
        communityId,
        deviceType
      };
      
      return await this.analyticsService.getEngagementMetrics(filters);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve engagement metrics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get revenue analytics
   */
  @Get('revenue')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Revenue' })
  @ApiOperation({
    summary: 'Get Revenue Analytics',
    description: 'Get financial analytics including total revenue, subscriptions, ARPU, MRR, and churn rate'
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
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Data granularity',
    example: 'month'
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalRevenue: { type: 'number' },
        subscriptionRevenue: { type: 'number' },
        oneTimeRevenue: { type: 'number' },
        averageRevenuePerUser: { type: 'number' },
        monthlyRecurringRevenue: { type: 'number' },
        churnRate: { type: 'number' },
        lifetimeValue: { type: 'number' },
        period: { type: 'object' }
      }
    }
  })
  async getRevenueAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month' | 'year'
  ): Promise<RevenueMetrics> {
    try {
      const period = this.buildTimePeriod(startDate, endDate, granularity);
      return await this.analyticsService.getRevenueAnalytics(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve revenue analytics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get platform health metrics
   */
  @Get('health')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Health' })
  @ApiOperation({
    summary: 'Get Platform Health Metrics',
    description: 'Get system health metrics including uptime, response times, error rates, and resource usage'
  })
  @ApiResponse({
    status: 200,
    description: 'Platform health metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        systemUptime: { type: 'number' },
        averageResponseTime: { type: 'number' },
        errorRate: { type: 'number' },
        activeConnections: { type: 'number' },
        databasePerformance: { type: 'object' },
        serverResources: { type: 'object' },
        lastUpdated: { type: 'string', format: 'date-time' }
      }
    }
  })
  async getPlatformHealth(): Promise<HealthMetrics> {
    try {
      return await this.analyticsService.getPlatformHealth();
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve platform health metrics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get comparative analytics
   */
  @Get('comparative')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Comparative' })
  @ApiOperation({
    summary: 'Get Comparative Analytics',
    description: 'Get analytics comparison between current and previous periods'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for current period',
    example: '2024-07-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for current period',
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
    description: 'Comparative analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        current: { type: 'object' },
        previous: { type: 'object' },
        comparison: {
          type: 'object',
          properties: {
            userGrowthChange: { type: 'number' },
            engagementChange: { type: 'number' },
            revenueChange: { type: 'number' }
          }
        }
      }
    }
  })
  async getComparativeAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month' | 'year'
  ): Promise<{
    current: GrowthMetrics;
    previous: GrowthMetrics;
    comparison: {
      userGrowthChange: number;
      engagementChange: number;
      revenueChange: number;
    };
  }> {
    try {
      const period = this.buildTimePeriod(startDate, endDate, granularity);
      return await this.analyticsService.getComparativeAnalytics(period);
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve comparative analytics: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Generate analytics report
   */
  @Get('report')
  @RequireAdminPermissions(AdminPermission.VIEW_ANALYTICS, AdminPermission.EXPORT_DATA)
  @AuditContext({ action: AdminAction.ANALYTICS_VIEW, entityType: 'Report' })
  @ApiOperation({
    summary: 'Generate Analytics Report',
    description: 'Generate a comprehensive analytics report with summary, metrics, and recommendations'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for report period',
    example: '2024-01-01T00:00:00.000Z'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for report period',
    example: '2024-12-31T23:59:59.999Z'
  })
  @ApiQuery({
    name: 'includeCharts',
    required: false,
    type: 'boolean',
    description: 'Include chart data in the report',
    example: true
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics report generated successfully',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'object' },
        metrics: { type: 'object' },
        recommendations: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  })
  async generateAnalyticsReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('includeCharts') includeCharts?: boolean
  ): Promise<{
    summary: any;
    metrics: any;
    recommendations: string[];
  }> {
    try {
      const period = this.buildTimePeriod(startDate, endDate);
      return await this.analyticsService.generateAnalyticsReport(period, includeCharts);
    } catch (error) {
      throw new HttpException(
        `Failed to generate analytics report: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Helper method to build TimePeriod from query parameters
   */
  private buildTimePeriod(
    startDate?: string,
    endDate?: string,
    granularity?: 'day' | 'week' | 'month' | 'year'
  ): TimePeriod {
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    let start: Date;
    let end: Date;

    try {
      start = startDate ? new Date(startDate) : defaultStartDate;
      end = endDate ? new Date(endDate) : now;
    } catch (error) {
      throw new Error('Invalid date format. Please use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }

    if (start >= end) {
      throw new Error('Start date must be before end date');
    }

    return {
      startDate: start,
      endDate: end,
      granularity: granularity || 'day'
    };
  }
}
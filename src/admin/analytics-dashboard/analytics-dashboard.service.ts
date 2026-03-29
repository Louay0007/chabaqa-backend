import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  AnalyticsService, 
  TimePeriod,
  EngagementMetrics,
  RevenueMetrics,
  HealthMetrics
} from '../common/services/analytics.service';
import { ExportService, ExportType, ExportFormat } from '../common/services/export.service';
import { AdminNotificationService, AdminNotificationType } from '../common/services/admin-notification.service';
import { AlertSeverity as SecurityAlertSeverity } from '../common/services/security-monitoring.service';
import {
  PlatformStatisticsDto,
  EngagementMetricsDto,
  RetentionAnalysisDto,
  DashboardResponseDto,
} from './dto/analytics-dashboard.dto';
import {
  CreateAlertDto,
  UpdateAlertDto,
  AlertResponseDto,
  AlertNotificationDto,
  AlertMetricType,
  AlertCondition,
  AlertSeverity
} from './dto/alert-config.dto';
import { AdminAlertConfig, AdminAlertConfigDocument } from './schemas/admin-alert-config.schema';

/**
 * AnalyticsDashboardService provides comprehensive analytics dashboard functionality
 * Handles platform-wide statistics, engagement metrics, retention analysis, and alert management
 */
@Injectable()
export class AnalyticsDashboardService {
  constructor(
    @InjectModel(AdminAlertConfig.name)
    private readonly adminAlertConfigModel: Model<AdminAlertConfigDocument>,
    private readonly analyticsService: AnalyticsService,
    private readonly exportService: ExportService,
    private readonly adminNotificationService: AdminNotificationService
  ) {}

  /**
   * Get comprehensive dashboard data with all metrics
   * Requirements: 5.1, 5.2, 5.3
   */
  async getDashboardData(period: TimePeriod): Promise<DashboardResponseDto> {
    // Fetch all metrics in parallel for performance
    const [
      userGrowth,
      engagement,
      revenue,
      health,
      platformStats,
      retentionAnalysis
    ] = await Promise.all([
      this.analyticsService.calculateUserGrowth(period),
      this.analyticsService.getEngagementMetrics({}, period),
      this.analyticsService.getRevenueAnalytics(period),
      this.analyticsService.getPlatformHealth(),
      this.calculatePlatformStatistics(period),
      this.analyticsService.getRetentionMetrics(period),
    ]);

    return {
      platformStatistics: platformStats,
      engagementMetrics: this.mapEngagementMetrics(engagement),
      retentionAnalysis,
      revenueMetrics: revenue,
      healthMetrics: health,
      userGrowth,
      generatedAt: new Date()
    };
  }

  /**
   * Calculate platform-wide statistics
   * Requirements: 5.1
   */
  async calculatePlatformStatistics(period: TimePeriod): Promise<PlatformStatisticsDto> {
    const [userGrowth, revenue, health, contentMetrics] = await Promise.all([
      this.analyticsService.calculateUserGrowth(period),
      this.analyticsService.getRevenueAnalytics(period),
      this.analyticsService.getPlatformHealth(),
      this.analyticsService.getPlatformContentMetrics(),
    ]);

    const healthScore = this.calculateHealthScore(health);

    return {
      totalUsers: userGrowth.totalUsers,
      totalCommunities: userGrowth.totalCommunities,
      totalContent: contentMetrics.totalContent,
      totalRevenue: revenue.totalRevenue,
      activeUsers: userGrowth.activeUsers,
      newUsers: userGrowth.newUsers,
      growthRate: userGrowth.growthRate,
      healthScore
    };
  }

  /**
   * Get engagement metrics with additional calculations
   * Requirements: 5.2
   */
  async getEngagementMetrics(period: TimePeriod): Promise<EngagementMetricsDto> {
    const engagement = await this.analyticsService.getEngagementMetrics({}, period);
    return this.mapEngagementMetrics(engagement);
  }

  /**
   * Calculate retention analysis with cohort data
   * Requirements: 5.3
   */
  async calculateRetentionAnalysis(period: TimePeriod): Promise<RetentionAnalysisDto> {
    return this.analyticsService.getRetentionMetrics(period);
  }

  /**
   * Export analytics data in specified format
   * Requirements: 5.6
   */
  async exportAnalyticsData(
    period: TimePeriod,
    format: 'csv' | 'excel' | 'pdf',
    customFields?: string[],
    adminId?: string
  ): Promise<{ downloadUrl: string; jobId: string }> {
    // Get dashboard data
    const dashboardData = await this.getDashboardData(period);

    // Prepare export data based on custom fields or include all
    const exportData = this.prepareExportData(dashboardData, customFields);

    // Map format to ExportFormat enum
    const exportFormat = format === 'csv' ? ExportFormat.CSV 
      : format === 'excel' ? ExportFormat.EXCEL 
      : ExportFormat.PDF;

    // Create export job
    const exportJob = await this.exportService.createExportJob({
      type: ExportType.ANALYTICS,
      format: exportFormat,
      filters: { period, customFields },
      createdBy: adminId ? new Types.ObjectId(adminId) : new Types.ObjectId()
    });

    return {
      jobId: exportJob.id,
      downloadUrl: exportJob.downloadUrl || ''
    };
  }

  /**
   * Create alert configuration
   * Requirements: 5.5
   */
  async createAlert(
    createAlertDto: CreateAlertDto,
    adminId: string
  ): Promise<AlertResponseDto> {
    const created = await this.adminAlertConfigModel.create({
      name: createAlertDto.name,
      description: createAlertDto.description,
      metricType: createAlertDto.metricType,
      condition: createAlertDto.condition,
      threshold: createAlertDto.threshold,
      severity: createAlertDto.severity,
      isEnabled: true,
      notifyAdmins: createAlertDto.notifyAdmins || [],
      notifyEmails: createAlertDto.notifyEmails || [],
      triggerCount: 0,
      createdBy: Types.ObjectId.isValid(adminId) ? new Types.ObjectId(adminId) : new Types.ObjectId(),
    });

    return this.mapAlertDocument(created);
  }

  /**
   * Update alert configuration
   * Requirements: 5.5
   */
  async updateAlert(
    alertId: string,
    updateAlertDto: UpdateAlertDto
  ): Promise<AlertResponseDto> {
    const alert = await this.adminAlertConfigModel.findById(alertId).exec();
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    if (typeof updateAlertDto.name === 'string') {
      alert.name = updateAlertDto.name;
    }
    if (typeof updateAlertDto.description === 'string') {
      alert.description = updateAlertDto.description;
    }
    if (typeof updateAlertDto.threshold === 'number') {
      alert.threshold = updateAlertDto.threshold;
    }
    if (updateAlertDto.severity) {
      alert.severity = updateAlertDto.severity as AlertSeverity;
    }
    if (typeof updateAlertDto.isEnabled === 'boolean') {
      alert.isEnabled = updateAlertDto.isEnabled;
    }
    if (Array.isArray(updateAlertDto.notifyAdmins)) {
      alert.notifyAdmins = updateAlertDto.notifyAdmins;
    }
    if (Array.isArray(updateAlertDto.notifyEmails)) {
      alert.notifyEmails = updateAlertDto.notifyEmails;
    }

    const saved = await alert.save();
    return this.mapAlertDocument(saved);
  }

  /**
   * Get all alert configurations
   * Requirements: 5.5
   */
  async getAlerts(): Promise<AlertResponseDto[]> {
    const alerts = await this.adminAlertConfigModel.find().sort({ createdAt: -1 }).exec();
    return alerts.map((alert) => this.mapAlertDocument(alert));
  }

  /**
   * Get alert by ID
   * Requirements: 5.5
   */
  async getAlertById(alertId: string): Promise<AlertResponseDto> {
    const alert = await this.adminAlertConfigModel.findById(alertId).exec();
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    return this.mapAlertDocument(alert);
  }

  /**
   * Delete alert configuration
   * Requirements: 5.5
   */
  async deleteAlert(alertId: string): Promise<void> {
    const deleted = await this.adminAlertConfigModel.findByIdAndDelete(alertId).exec();
    if (!deleted) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }
  }

  /**
   * Check metrics against alert thresholds and trigger notifications
   * Requirements: 5.5
   */
  async checkAlerts(): Promise<AlertNotificationDto[]> {
    const alerts = await this.getAlerts();
    const triggeredAlerts: AlertNotificationDto[] = [];

    // Get current metrics
    const health = await this.analyticsService.getPlatformHealth();
    const period: TimePeriod = {
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date()
    };
    const userGrowth = await this.analyticsService.calculateUserGrowth(period);

    for (const alert of alerts) {
      if (!alert.isEnabled) continue;

      const currentValue = this.getMetricValue(alert.metricType as AlertMetricType, { health, userGrowth });
      const shouldTrigger = this.evaluateAlertCondition(
        currentValue,
        alert.condition as AlertCondition,
        alert.threshold
      );

      if (shouldTrigger) {
        await this.adminAlertConfigModel.findByIdAndUpdate(alert.id, {
          $inc: { triggerCount: 1 },
          $set: { lastTriggered: new Date() },
        }).exec();

        const notification: AlertNotificationDto = {
          alertId: alert.id,
          alertName: alert.name,
          metricType: alert.metricType,
          currentValue,
          threshold: alert.threshold,
          severity: alert.severity,
          triggeredAt: new Date(),
          context: { health, userGrowth }
        };

        triggeredAlerts.push(notification);

        // Send notifications
        await this.sendAlertNotifications(alert, notification);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Helper: Map engagement metrics to DTO
   */
  private mapEngagementMetrics(engagement: EngagementMetrics): EngagementMetricsDto {
    const engagementRate = engagement.totalSessions > 0
      ? engagement.contentInteractions / engagement.totalSessions
      : 0;

    return {
      totalSessions: engagement.totalSessions,
      averageSessionDuration: engagement.averageSessionDuration,
      pageViews: engagement.pageViews,
      bounceRate: engagement.bounceRate,
      contentInteractions: engagement.contentInteractions,
      communityParticipation: engagement.communityParticipation,
      engagementRate: Number(engagementRate.toFixed(4)),
      breakdown: [
        { metric: 'Sessions', value: engagement.totalSessions },
        { metric: 'Page Views', value: engagement.pageViews },
        { metric: 'Interactions', value: engagement.contentInteractions },
        { metric: 'Communities', value: engagement.communityParticipation },
      ],
    };
  }

  /**
   * Helper: Calculate health score from health metrics
   */
  private calculateHealthScore(health: HealthMetrics): number {
    const normalizeRatio = (value: number) => (value > 1 ? value / 100 : value);

    // Weight different factors
    const uptimeScore = health.systemUptime;
    const responseTimeScore = Math.max(0, 100 - (health.averageResponseTime / 5));
    const errorRateScore = Math.max(0, 100 - (health.errorRate * 2000));
    const resourceScore = (
      (1 - normalizeRatio(health.serverResources.cpuUsage)) * 25 +
      (1 - normalizeRatio(health.serverResources.memoryUsage)) * 25 +
      (1 - normalizeRatio(health.serverResources.diskUsage)) * 25 +
      normalizeRatio(health.databasePerformance.indexEfficiency) * 25
    );

    const totalScore = (
      uptimeScore * 0.3 +
      responseTimeScore * 0.3 +
      errorRateScore * 0.2 +
      resourceScore * 0.2
    );

    return Math.round(Math.min(100, Math.max(0, totalScore)));
  }

  /**
   * Helper: Prepare export data based on custom fields
   */
  private prepareExportData(dashboardData: DashboardResponseDto, customFields?: string[]): any {
    if (!customFields || customFields.length === 0) {
      return dashboardData;
    }

    const exportData: any = {};
    
    for (const field of customFields) {
      if (field in dashboardData) {
        exportData[field] = dashboardData[field as keyof DashboardResponseDto];
      }
    }

    return exportData;
  }

  /**
   * Helper: Get current value for a metric type
   */
  private getMetricValue(metricType: AlertMetricType, data: any): number {
    switch (metricType) {
      case AlertMetricType.ERROR_RATE:
        return data.health?.errorRate || 0;
      case AlertMetricType.RESPONSE_TIME:
        return data.health?.averageResponseTime || 0;
      case AlertMetricType.USER_GROWTH:
        return data.userGrowth?.growthRate || 0;
      case AlertMetricType.CHURN_RATE:
        return data.userGrowth?.churnedUsers || 0;
      case AlertMetricType.SYSTEM_HEALTH:
        return this.calculateHealthScore(data.health);
      case AlertMetricType.PENDING_CONTENT:
      case AlertMetricType.FLAGGED_CONTENT:
      case AlertMetricType.PENDING_COMMUNITIES:
      case AlertMetricType.FAILED_LOGINS:
      case AlertMetricType.HIGH_VALUE_TRANSACTION:
        return 0;
      default:
        return 0;
    }
  }

  private mapAlertDocument(alert: AdminAlertConfigDocument): AlertResponseDto {
    return {
      id: alert._id.toString(),
      name: alert.name,
      description: alert.description,
      metricType: alert.metricType,
      condition: alert.condition,
      threshold: alert.threshold,
      severity: alert.severity,
      isEnabled: Boolean(alert.isEnabled),
      notifyAdmins: Array.isArray(alert.notifyAdmins) ? alert.notifyAdmins : [],
      notifyEmails: Array.isArray(alert.notifyEmails) ? alert.notifyEmails : [],
      triggerCount: alert.triggerCount || 0,
      lastTriggered: alert.lastTriggered,
      createdBy: String(alert.createdBy),
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
    };
  }

  /**
   * Helper: Evaluate alert condition
   */
  private evaluateAlertCondition(
    currentValue: number,
    condition: AlertCondition,
    threshold: number
  ): boolean {
    switch (condition) {
      case AlertCondition.GREATER_THAN:
        return currentValue > threshold;
      case AlertCondition.LESS_THAN:
        return currentValue < threshold;
      case AlertCondition.EQUALS:
        return Math.abs(currentValue - threshold) < 0.01;
      default:
        return false;
    }
  }

  /**
   * Helper: Send alert notifications
   */
  private async sendAlertNotifications(
    alert: AlertResponseDto,
    notification: AlertNotificationDto
  ): Promise<void> {
    // Map alert severity to SecurityAlertSeverity enum
    const severity = alert.severity === AlertSeverity.CRITICAL ? SecurityAlertSeverity.CRITICAL
      : alert.severity === AlertSeverity.WARNING ? SecurityAlertSeverity.HIGH
      : SecurityAlertSeverity.MEDIUM;

    // Send system alert notification
    await this.adminNotificationService.sendSystemAlert(
      alert.name,
      `${alert.metricType} is ${notification.currentValue}, threshold: ${alert.threshold}`,
      severity,
      notification
    );

    // In a real implementation, would also send emails to notifyEmails
    console.log(`Alert triggered: ${alert.name}`, notification);
  }
}

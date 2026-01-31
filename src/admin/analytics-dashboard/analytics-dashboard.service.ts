import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  AnalyticsService, 
  TimePeriod,
  GrowthMetrics,
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
  CohortData
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

/**
 * AnalyticsDashboardService provides comprehensive analytics dashboard functionality
 * Handles platform-wide statistics, engagement metrics, retention analysis, and alert management
 */
@Injectable()
export class AnalyticsDashboardService {
  constructor(
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
      this.analyticsService.getEngagementMetrics(),
      this.analyticsService.getRevenueAnalytics(period),
      this.analyticsService.getPlatformHealth(),
      this.calculatePlatformStatistics(period),
      this.calculateRetentionAnalysis(period)
    ]);

    return {
      platformStatistics: platformStats,
      engagementMetrics: this.mapEngagementMetrics(engagement),
      retentionAnalysis,
      revenueMetrics: revenue,
      healthMetrics: health,
      generatedAt: new Date()
    };
  }

  /**
   * Calculate platform-wide statistics
   * Requirements: 5.1
   */
  async calculatePlatformStatistics(period: TimePeriod): Promise<PlatformStatisticsDto> {
    const [userGrowth, revenue, health] = await Promise.all([
      this.analyticsService.calculateUserGrowth(period),
      this.analyticsService.getRevenueAnalytics(period),
      this.analyticsService.getPlatformHealth()
    ]);

    // Calculate health score based on multiple factors
    const healthScore = this.calculateHealthScore(health);

    return {
      totalUsers: userGrowth.totalUsers,
      totalCommunities: Math.floor(100 + Math.random() * 500), // Mock data
      totalContent: Math.floor(1000 + Math.random() * 5000), // Mock data
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
    const engagement = await this.analyticsService.getEngagementMetrics();
    return this.mapEngagementMetrics(engagement);
  }

  /**
   * Calculate retention analysis with cohort data
   * Requirements: 5.3
   */
  async calculateRetentionAnalysis(period: TimePeriod): Promise<RetentionAnalysisDto> {
    // In a real implementation, this would query actual user activity data
    // For now, we'll generate realistic mock data
    
    const day1Retention = 0.6 + Math.random() * 0.2; // 60-80%
    const day7Retention = 0.4 + Math.random() * 0.2; // 40-60%
    const day30Retention = 0.2 + Math.random() * 0.2; // 20-40%
    const overallRetention = (day1Retention + day7Retention + day30Retention) / 3;
    const churnRate = 1 - overallRetention;

    // Generate cohort analysis data
    const cohortAnalysis = this.generateCohortAnalysis(period);

    return {
      day1Retention: Math.round(day1Retention * 100) / 100,
      day7Retention: Math.round(day7Retention * 100) / 100,
      day30Retention: Math.round(day30Retention * 100) / 100,
      overallRetention: Math.round(overallRetention * 100) / 100,
      churnRate: Math.round(churnRate * 100) / 100,
      cohortAnalysis
    };
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
    // In a real implementation, this would save to database
    // For now, we'll return a mock response
    
    const alert: AlertResponseDto = {
      id: new Types.ObjectId().toString(),
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
      createdBy: adminId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return alert;
  }

  /**
   * Update alert configuration
   * Requirements: 5.5
   */
  async updateAlert(
    alertId: string,
    updateAlertDto: UpdateAlertDto
  ): Promise<AlertResponseDto> {
    // In a real implementation, this would update in database
    // For now, we'll return a mock response
    
    const alert: AlertResponseDto = {
      id: alertId,
      name: updateAlertDto.name || 'Updated Alert',
      description: updateAlertDto.description || 'Updated description',
      metricType: AlertMetricType.ERROR_RATE,
      condition: AlertCondition.GREATER_THAN,
      threshold: updateAlertDto.threshold || 5,
      severity: updateAlertDto.severity || AlertSeverity.WARNING,
      isEnabled: updateAlertDto.isEnabled !== undefined ? updateAlertDto.isEnabled : true,
      notifyAdmins: updateAlertDto.notifyAdmins || [],
      notifyEmails: updateAlertDto.notifyEmails || [],
      triggerCount: 0,
      createdBy: 'admin-id',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date()
    };

    return alert;
  }

  /**
   * Get all alert configurations
   * Requirements: 5.5
   */
  async getAlerts(): Promise<AlertResponseDto[]> {
    // In a real implementation, this would query from database
    // For now, we'll return mock data
    
    return [
      {
        id: new Types.ObjectId().toString(),
        name: 'High Error Rate',
        description: 'Triggers when error rate exceeds 5%',
        metricType: AlertMetricType.ERROR_RATE,
        condition: AlertCondition.GREATER_THAN,
        threshold: 5,
        severity: AlertSeverity.CRITICAL,
        isEnabled: true,
        notifyAdmins: [],
        notifyEmails: ['admin@example.com'],
        triggerCount: 3,
        lastTriggered: new Date(Date.now() - 3600000),
        createdBy: 'admin-id',
        createdAt: new Date(Date.now() - 86400000 * 7),
        updatedAt: new Date(Date.now() - 86400000)
      }
    ];
  }

  /**
   * Get alert by ID
   * Requirements: 5.5
   */
  async getAlertById(alertId: string): Promise<AlertResponseDto> {
    // In a real implementation, this would query from database
    const alerts = await this.getAlerts();
    const alert = alerts.find(a => a.id === alertId);
    
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found`);
    }

    return alert;
  }

  /**
   * Delete alert configuration
   * Requirements: 5.5
   */
  async deleteAlert(alertId: string): Promise<void> {
    // In a real implementation, this would delete from database
    // For now, we'll just validate the ID exists
    await this.getAlertById(alertId);
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

      const currentValue = this.getMetricValue(alert.metricType, { health, userGrowth });
      const shouldTrigger = this.evaluateAlertCondition(
        currentValue,
        alert.condition,
        alert.threshold
      );

      if (shouldTrigger) {
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
      ? (engagement.contentInteractions / engagement.totalSessions) * 100
      : 0;

    return {
      totalSessions: engagement.totalSessions,
      averageSessionDuration: engagement.averageSessionDuration,
      pageViews: engagement.pageViews,
      bounceRate: engagement.bounceRate,
      contentInteractions: engagement.contentInteractions,
      communityParticipation: engagement.communityParticipation,
      engagementRate: Math.round(engagementRate * 100) / 100
    };
  }

  /**
   * Helper: Calculate health score from health metrics
   */
  private calculateHealthScore(health: HealthMetrics): number {
    // Weight different factors
    const uptimeScore = health.systemUptime;
    const responseTimeScore = Math.max(0, 100 - (health.averageResponseTime / 5));
    const errorRateScore = Math.max(0, 100 - (health.errorRate * 2000));
    const resourceScore = (
      (1 - health.serverResources.cpuUsage) * 25 +
      (1 - health.serverResources.memoryUsage) * 25 +
      (1 - health.serverResources.diskUsage) * 25 +
      health.databasePerformance.indexEfficiency * 25
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
   * Helper: Generate cohort analysis data
   */
  private generateCohortAnalysis(period: TimePeriod): CohortData[] {
    const cohorts: CohortData[] = [];
    const monthsDiff = Math.ceil(
      (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    for (let i = 0; i < Math.min(monthsDiff, 12); i++) {
      const date = new Date(period.startDate);
      date.setMonth(date.getMonth() + i);
      
      const size = Math.floor(100 + Math.random() * 500);
      const retentionRate = 0.3 + Math.random() * 0.4;
      const retained = Math.floor(size * retentionRate);

      cohorts.push({
        period: date.toISOString().substring(0, 7), // YYYY-MM format
        size,
        retained,
        retentionRate: Math.round(retentionRate * 100) / 100
      });
    }

    return cohorts;
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
      default:
        return 0;
    }
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

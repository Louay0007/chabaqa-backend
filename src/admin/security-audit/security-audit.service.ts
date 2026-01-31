import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument, AdminAction } from '../schemas/audit-log.schema';
import { SecurityMonitoringService, SecurityAlert, AlertSeverity } from '../common/services/security-monitoring.service';
import { AdminNotificationService } from '../common/services/admin-notification.service';

/**
 * Security audit service for comprehensive security monitoring and audit management
 */
@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    private readonly securityMonitoringService: SecurityMonitoringService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  /**
   * Perform comprehensive security audit
   */
  async performSecurityAudit(timeRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    summary: any;
    alerts: SecurityAlert[];
    recommendations: string[];
    riskScore: number;
  }> {
    const { startDate, endDate } = timeRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate: new Date(),
    };

    // Get audit statistics
    const auditStats = await this.getAuditStatistics(startDate, endDate);
    
    // Get security alerts
    const alerts = this.securityMonitoringService.getAlerts({
      resolved: false,
    });

    // Generate security recommendations
    const recommendations = await this.generateSecurityRecommendations(auditStats, alerts);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(auditStats, alerts);

    return {
      summary: {
        auditPeriod: { startDate, endDate },
        totalActions: auditStats.totalActions,
        uniqueAdmins: auditStats.uniqueAdmins,
        failedActions: auditStats.failedActions,
        sensitiveActions: auditStats.sensitiveActions,
        ...auditStats,
      },
      alerts,
      recommendations,
      riskScore,
    };
  }

  /**
   * Get audit statistics for a time period
   */
  private async getAuditStatistics(startDate: Date, endDate: Date): Promise<any> {
    const matchStage = {
      timestamp: { $gte: startDate, $lte: endDate },
    };

    const [
      totalActions,
      uniqueAdmins,
      actionsByType,
      actionsByStatus,
      failedActions,
      sensitiveActions,
      hourlyDistribution,
      ipAddresses,
    ] = await Promise.all([
      // Total actions
      this.auditLogModel.countDocuments(matchStage),

      // Unique admin users
      this.auditLogModel.distinct('adminUserId', matchStage).then(ids => ids.length),

      // Actions by type
      this.auditLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Actions by status
      this.auditLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Failed actions
      this.auditLogModel.countDocuments({
        ...matchStage,
        status: 'failed',
      }),

      // Sensitive actions
      this.auditLogModel.countDocuments({
        ...matchStage,
        action: {
          $in: [
            AdminAction.USER_SUSPEND,
            AdminAction.ADMIN_USER_CREATE,
            AdminAction.ADMIN_USER_DELETE,
            AdminAction.DATA_EXPORT,
            AdminAction.AUDIT_LOG_EXPORT,
            AdminAction.PAYOUT_PROCESS,
          ],
        },
      }),

      // Hourly distribution
      this.auditLogModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $hour: '$timestamp' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Unique IP addresses
      this.auditLogModel.distinct('ipAddress', matchStage).then(ips => ips.length),
    ]);

    return {
      totalActions,
      uniqueAdmins,
      actionsByType,
      actionsByStatus,
      failedActions,
      sensitiveActions,
      hourlyDistribution,
      uniqueIpAddresses: ipAddresses,
    };
  }

  /**
   * Generate security recommendations based on audit data and alerts
   */
  private async generateSecurityRecommendations(
    auditStats: any,
    alerts: SecurityAlert[],
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Check for high failure rate
    const failureRate = auditStats.failedActions / auditStats.totalActions;
    if (failureRate > 0.1) {
      recommendations.push(
        `High failure rate detected (${(failureRate * 100).toFixed(1)}%). Consider reviewing authentication mechanisms and user training.`,
      );
    }

    // Check for excessive sensitive actions
    const sensitiveActionRate = auditStats.sensitiveActions / auditStats.totalActions;
    if (sensitiveActionRate > 0.2) {
      recommendations.push(
        `High rate of sensitive actions (${(sensitiveActionRate * 100).toFixed(1)}%). Consider implementing additional approval workflows.`,
      );
    }

    // Check for unresolved critical alerts
    const criticalAlerts = alerts.filter(alert => 
      alert.severity === AlertSeverity.CRITICAL && !alert.resolved
    );
    if (criticalAlerts.length > 0) {
      recommendations.push(
        `${criticalAlerts.length} unresolved critical security alerts. Immediate attention required.`,
      );
    }

    // Check for after-hours activity
    const afterHoursActivity = auditStats.hourlyDistribution.filter(
      (hour: any) => hour._id < 8 || hour._id > 18
    );
    const totalAfterHours = afterHoursActivity.reduce((sum: number, hour: any) => sum + hour.count, 0);
    const afterHoursRate = totalAfterHours / auditStats.totalActions;
    
    if (afterHoursRate > 0.3) {
      recommendations.push(
        `High after-hours activity (${(afterHoursRate * 100).toFixed(1)}%). Consider implementing time-based access controls.`,
      );
    }

    // Check for too many unique IP addresses (potential account sharing)
    const ipPerAdmin = auditStats.uniqueIpAddresses / auditStats.uniqueAdmins;
    if (ipPerAdmin > 5) {
      recommendations.push(
        `High IP address diversity per admin user (${ipPerAdmin.toFixed(1)} IPs per admin). Consider implementing IP whitelisting.`,
      );
    }

    // Check for insufficient admin diversity
    if (auditStats.uniqueAdmins < 3) {
      recommendations.push(
        'Low admin user diversity. Consider distributing administrative responsibilities among more users.',
      );
    }

    // Default recommendations if no specific issues found
    if (recommendations.length === 0) {
      recommendations.push(
        'Security posture appears healthy. Continue monitoring and consider periodic security reviews.',
        'Ensure all admin users complete regular security training.',
        'Review and update security policies quarterly.',
      );
    }

    return recommendations;
  }

  /**
   * Calculate overall security risk score (0-100, higher is riskier)
   */
  private calculateRiskScore(auditStats: any, alerts: SecurityAlert[]): number {
    let riskScore = 0;

    // Base risk from failure rate
    const failureRate = auditStats.failedActions / auditStats.totalActions;
    riskScore += failureRate * 30; // Max 30 points

    // Risk from unresolved alerts
    const unresolvedAlerts = alerts.filter(alert => !alert.resolved);
    const criticalAlerts = unresolvedAlerts.filter(alert => alert.severity === AlertSeverity.CRITICAL);
    const highAlerts = unresolvedAlerts.filter(alert => alert.severity === AlertSeverity.HIGH);
    
    riskScore += criticalAlerts.length * 15; // 15 points per critical alert
    riskScore += highAlerts.length * 8; // 8 points per high alert
    riskScore += unresolvedAlerts.length * 2; // 2 points per unresolved alert

    // Risk from sensitive action rate
    const sensitiveActionRate = auditStats.sensitiveActions / auditStats.totalActions;
    if (sensitiveActionRate > 0.2) {
      riskScore += (sensitiveActionRate - 0.2) * 50; // Penalty for excessive sensitive actions
    }

    // Risk from admin diversity
    if (auditStats.uniqueAdmins < 3) {
      riskScore += (3 - auditStats.uniqueAdmins) * 5; // Penalty for low admin diversity
    }

    // Risk from IP diversity
    const ipPerAdmin = auditStats.uniqueIpAddresses / auditStats.uniqueAdmins;
    if (ipPerAdmin > 5) {
      riskScore += (ipPerAdmin - 5) * 2; // Penalty for high IP diversity
    }

    // Cap at 100
    return Math.min(Math.round(riskScore), 100);
  }

  /**
   * Get security compliance report
   */
  async getComplianceReport(): Promise<{
    auditLogRetention: boolean;
    accessControlImplemented: boolean;
    securityMonitoringActive: boolean;
    alertNotificationsConfigured: boolean;
    dataExportTracking: boolean;
    complianceScore: number;
    recommendations: string[];
  }> {
    // Check audit log retention (should have logs from at least 90 days ago)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const oldestLog = await this.auditLogModel.findOne().sort({ timestamp: 1 });
    const auditLogRetention = oldestLog ? oldestLog.timestamp <= ninetyDaysAgo : false;

    // Check if access control is implemented (should have role-based actions)
    const roleBasedActions = await this.auditLogModel.countDocuments({
      action: { $in: [AdminAction.ADMIN_USER_CREATE, AdminAction.ADMIN_USER_UPDATE] },
    });
    const accessControlImplemented = roleBasedActions > 0;

    // Check if security monitoring is active (should have recent security-related logs)
    const recentSecurityLogs = await this.auditLogModel.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      action: { $in: [AdminAction.LOGIN, AdminAction.LOGOUT] },
    });
    const securityMonitoringActive = recentSecurityLogs > 0;

    // Check if alert notifications are configured
    const notificationStats = this.adminNotificationService.getNotificationStatistics();
    const alertNotificationsConfigured = notificationStats.total > 0;

    // Check if data export tracking is implemented
    const dataExportLogs = await this.auditLogModel.countDocuments({
      action: { $in: [AdminAction.DATA_EXPORT, AdminAction.AUDIT_LOG_EXPORT] },
    });
    const dataExportTracking = dataExportLogs > 0;

    // Calculate compliance score
    const checks = [
      auditLogRetention,
      accessControlImplemented,
      securityMonitoringActive,
      alertNotificationsConfigured,
      dataExportTracking,
    ];
    const complianceScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);

    // Generate compliance recommendations
    const recommendations: string[] = [];
    if (!auditLogRetention) {
      recommendations.push('Implement audit log retention policy for at least 90 days');
    }
    if (!accessControlImplemented) {
      recommendations.push('Implement role-based access control for admin functions');
    }
    if (!securityMonitoringActive) {
      recommendations.push('Activate security monitoring for login/logout events');
    }
    if (!alertNotificationsConfigured) {
      recommendations.push('Configure alert notifications for security events');
    }
    if (!dataExportTracking) {
      recommendations.push('Implement tracking for data export operations');
    }

    return {
      auditLogRetention,
      accessControlImplemented,
      securityMonitoringActive,
      alertNotificationsConfigured,
      dataExportTracking,
      complianceScore,
      recommendations,
    };
  }

  /**
   * Generate security incident report
   */
  async generateIncidentReport(incidentId: string): Promise<{
    incident: SecurityAlert;
    relatedLogs: any[];
    timeline: any[];
    impact: string;
    recommendations: string[];
  }> {
    // Get the security alert
    const alerts = this.securityMonitoringService.getAlerts();
    const incident = alerts.find(alert => alert.id === incidentId);
    
    if (!incident) {
      throw new Error('Security incident not found');
    }

    // Get related audit logs
    const relatedLogs = await this.auditLogModel
      .find({
        adminUserId: incident.adminUserId,
        timestamp: {
          $gte: new Date(incident.timestamp.getTime() - 60 * 60 * 1000), // 1 hour before
          $lte: new Date(incident.timestamp.getTime() + 60 * 60 * 1000), // 1 hour after
        },
      })
      .sort({ timestamp: 1 })
      .exec();

    // Create timeline
    const timeline = relatedLogs.map(log => ({
      timestamp: log.timestamp,
      action: log.action,
      status: log.status,
      description: log.description || `${log.action} on ${log.entityType}`,
      ipAddress: log.ipAddress,
    }));

    // Assess impact
    const impact = this.assessIncidentImpact(incident, relatedLogs);

    // Generate recommendations
    const recommendations = this.generateIncidentRecommendations(incident, relatedLogs);

    return {
      incident,
      relatedLogs,
      timeline,
      impact,
      recommendations,
    };
  }

  /**
   * Assess the impact of a security incident
   */
  private assessIncidentImpact(incident: SecurityAlert, relatedLogs: any[]): string {
    const sensitiveActions = relatedLogs.filter(log =>
      [
        AdminAction.USER_SUSPEND,
        AdminAction.DATA_EXPORT,
        AdminAction.PAYOUT_PROCESS,
        AdminAction.ADMIN_USER_CREATE,
        AdminAction.ADMIN_USER_DELETE,
      ].includes(log.action)
    );

    if (incident.severity === AlertSeverity.CRITICAL) {
      return 'HIGH - Critical security incident with potential for significant system compromise';
    } else if (incident.severity === AlertSeverity.HIGH && sensitiveActions.length > 0) {
      return 'MEDIUM-HIGH - High severity incident involving sensitive operations';
    } else if (sensitiveActions.length > 3) {
      return 'MEDIUM - Multiple sensitive operations detected';
    } else {
      return 'LOW - Limited impact, monitoring recommended';
    }
  }

  /**
   * Generate recommendations for incident response
   */
  private generateIncidentRecommendations(incident: SecurityAlert, relatedLogs: any[]): string[] {
    const recommendations: string[] = [];

    switch (incident.type) {
      case 'multiple_failed_attempts':
        recommendations.push(
          'Temporarily lock the admin account',
          'Verify the identity of the admin user',
          'Check for password compromise',
          'Consider implementing account lockout policies',
        );
        break;

      case 'unusual_activity_pattern':
        recommendations.push(
          'Verify admin user identity through secondary channel',
          'Review all actions performed during the incident window',
          'Check for account compromise indicators',
          'Consider implementing behavioral analysis',
        );
        break;

      case 'bulk_operation_abuse':
        recommendations.push(
          'Review all bulk operations performed',
          'Verify business justification for bulk operations',
          'Implement approval workflow for bulk operations',
          'Monitor for data integrity issues',
        );
        break;

      case 'data_export_abuse':
        recommendations.push(
          'Immediately review exported data content',
          'Verify business justification for exports',
          'Check for data leakage or unauthorized access',
          'Implement export approval workflow',
          'Consider revoking admin access temporarily',
        );
        break;

      default:
        recommendations.push(
          'Investigate the incident thoroughly',
          'Document all findings',
          'Implement preventive measures',
          'Monitor for similar incidents',
        );
    }

    return recommendations;
  }
}
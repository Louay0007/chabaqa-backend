import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument, AdminAction } from '../../schemas/audit-log.schema';
import { AdminNotificationService } from './admin-notification.service';

/**
 * Security alert types
 */
export enum SecurityAlertType {
  SUSPICIOUS_LOGIN = 'suspicious_login',
  MULTIPLE_FAILED_ATTEMPTS = 'multiple_failed_attempts',
  UNUSUAL_ACTIVITY_PATTERN = 'unusual_activity_pattern',
  BULK_OPERATION_ABUSE = 'bulk_operation_abuse',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_EXPORT_ABUSE = 'data_export_abuse',
  AFTER_HOURS_ACCESS = 'after_hours_access',
  GEOGRAPHIC_ANOMALY = 'geographic_anomaly',
  HIGH_VOLUME_ACTIONS = 'high_volume_actions',
  SENSITIVE_DATA_ACCESS = 'sensitive_data_access',
}

/**
 * Security alert severity levels
 */
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Security alert interface
 */
export interface SecurityAlert {
  id?: string;
  type: SecurityAlertType;
  severity: AlertSeverity;
  adminUserId: Types.ObjectId;
  title: string;
  description: string;
  metadata: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionNotes?: string;
}

/**
 * Security monitoring configuration
 */
export interface SecurityMonitoringConfig {
  // Failed login attempts threshold
  maxFailedLogins: number;
  failedLoginTimeWindow: number; // minutes
  
  // Activity volume thresholds
  maxActionsPerHour: number;
  maxBulkOperationsPerDay: number;
  maxDataExportsPerDay: number;
  
  // Time-based monitoring
  businessHoursStart: number; // hour (0-23)
  businessHoursEnd: number; // hour (0-23)
  
  // Geographic monitoring
  enableGeographicMonitoring: boolean;
  allowedCountries: string[];
  
  // Sensitive actions monitoring
  sensitiveActions: AdminAction[];
  
  // Alert notification settings
  notifyOnCritical: boolean;
  notifyOnHigh: boolean;
  alertRecipients: string[];
}

/**
 * Default security monitoring configuration
 */
const DEFAULT_CONFIG: SecurityMonitoringConfig = {
  maxFailedLogins: 5,
  failedLoginTimeWindow: 15,
  maxActionsPerHour: 100,
  maxBulkOperationsPerDay: 10,
  maxDataExportsPerDay: 5,
  businessHoursStart: 8,
  businessHoursEnd: 18,
  enableGeographicMonitoring: false,
  allowedCountries: [],
  sensitiveActions: [
    AdminAction.USER_SUSPEND,
    AdminAction.ADMIN_USER_CREATE,
    AdminAction.ADMIN_USER_DELETE,
    AdminAction.DATA_EXPORT,
    AdminAction.AUDIT_LOG_EXPORT,
    AdminAction.PAYOUT_PROCESS,
  ],
  notifyOnCritical: true,
  notifyOnHigh: true,
  alertRecipients: [],
};

/**
 * Security monitoring and alerting service
 * Monitors admin activities for suspicious behavior and security threats
 */
@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private config: SecurityMonitoringConfig = DEFAULT_CONFIG;
  private alerts: Map<string, SecurityAlert> = new Map();

  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    private adminNotificationService: AdminNotificationService,
  ) {
    // Only start monitoring processes in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.startPeriodicMonitoring();
    }
  }

  /**
   * Update security monitoring configuration
   */
  updateConfiguration(config: Partial<SecurityMonitoringConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('Security monitoring configuration updated');
  }

  /**
   * Get current security monitoring configuration
   */
  getConfiguration(): SecurityMonitoringConfig {
    return { ...this.config };
  }

  /**
   * Monitor a specific admin action for security threats
   */
  async monitorAction(auditLog: AuditLog): Promise<void> {
    try {
      // Check for various security threats
      await Promise.all([
        this.checkFailedLoginAttempts(auditLog),
        this.checkUnusualActivityPattern(auditLog),
        this.checkBulkOperationAbuse(auditLog),
        this.checkDataExportAbuse(auditLog),
        this.checkAfterHoursAccess(auditLog),
        this.checkHighVolumeActions(auditLog),
        this.checkSensitiveDataAccess(auditLog),
      ]);
    } catch (error) {
      this.logger.error('Error monitoring admin action:', error);
    }
  }

  /**
   * Check for multiple failed login attempts
   */
  private async checkFailedLoginAttempts(auditLog: AuditLog): Promise<void> {
    if (auditLog.action !== AdminAction.LOGIN || auditLog.status === 'success') {
      return;
    }

    const timeWindow = new Date(Date.now() - this.config.failedLoginTimeWindow * 60 * 1000);
    
    const failedAttempts = await this.auditLogModel.countDocuments({
      adminUserId: auditLog.adminUserId,
      action: AdminAction.LOGIN,
      status: 'failed',
      timestamp: { $gte: timeWindow },
    });

    if (failedAttempts >= this.config.maxFailedLogins) {
      await this.createAlert({
        type: SecurityAlertType.MULTIPLE_FAILED_ATTEMPTS,
        severity: AlertSeverity.HIGH,
        adminUserId: auditLog.adminUserId,
        title: 'Multiple Failed Login Attempts',
        description: `Admin user has ${failedAttempts} failed login attempts in the last ${this.config.failedLoginTimeWindow} minutes`,
        metadata: {
          failedAttempts,
          timeWindow: this.config.failedLoginTimeWindow,
          ipAddress: auditLog.ipAddress,
          userAgent: auditLog.userAgent,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Check for unusual activity patterns
   */
  private async checkUnusualActivityPattern(auditLog: AuditLog): Promise<void> {
    try {
      // Check for rapid succession of different action types
      const recentActions = await this.auditLogModel
        .find({
          adminUserId: auditLog.adminUserId,
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
        })
        .sort({ timestamp: -1 })
        .limit(20);

      // Handle case where no recent actions are found
      if (!recentActions || recentActions.length === 0) {
        return;
      }

      const uniqueActions = new Set(recentActions.map(log => log.action));
      const uniqueEntityTypes = new Set(recentActions.map(log => log.entityType));

      // Alert if too many different actions or entity types in short time
      if (uniqueActions.size > 8 || uniqueEntityTypes.size > 5) {
        await this.createAlert({
          type: SecurityAlertType.UNUSUAL_ACTIVITY_PATTERN,
          severity: AlertSeverity.MEDIUM,
          adminUserId: auditLog.adminUserId,
          title: 'Unusual Activity Pattern Detected',
          description: `Admin user performed ${uniqueActions.size} different action types across ${uniqueEntityTypes.size} entity types in 5 minutes`,
          metadata: {
            uniqueActions: Array.from(uniqueActions),
            uniqueEntityTypes: Array.from(uniqueEntityTypes),
            totalActions: recentActions.length,
          },
          timestamp: new Date(),
          resolved: false,
        });
      }
    } catch (error) {
      this.logger.error('Error checking unusual activity pattern:', error);
    }
  }

  /**
   * Check for bulk operation abuse
   */
  private async checkBulkOperationAbuse(auditLog: AuditLog): Promise<void> {
    if (auditLog.action !== AdminAction.BULK_OPERATION) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bulkOperationsToday = await this.auditLogModel.countDocuments({
      adminUserId: auditLog.adminUserId,
      action: AdminAction.BULK_OPERATION,
      timestamp: { $gte: today },
    });

    if (bulkOperationsToday > this.config.maxBulkOperationsPerDay) {
      await this.createAlert({
        type: SecurityAlertType.BULK_OPERATION_ABUSE,
        severity: AlertSeverity.HIGH,
        adminUserId: auditLog.adminUserId,
        title: 'Excessive Bulk Operations',
        description: `Admin user performed ${bulkOperationsToday} bulk operations today, exceeding the limit of ${this.config.maxBulkOperationsPerDay}`,
        metadata: {
          bulkOperationsToday,
          limit: this.config.maxBulkOperationsPerDay,
          entityType: auditLog.entityType,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Check for data export abuse
   */
  private async checkDataExportAbuse(auditLog: AuditLog): Promise<void> {
    if (auditLog.action !== AdminAction.DATA_EXPORT && auditLog.action !== AdminAction.AUDIT_LOG_EXPORT) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exportsToday = await this.auditLogModel.countDocuments({
      adminUserId: auditLog.adminUserId,
      action: { $in: [AdminAction.DATA_EXPORT, AdminAction.AUDIT_LOG_EXPORT] },
      timestamp: { $gte: today },
    });

    if (exportsToday > this.config.maxDataExportsPerDay) {
      await this.createAlert({
        type: SecurityAlertType.DATA_EXPORT_ABUSE,
        severity: AlertSeverity.CRITICAL,
        adminUserId: auditLog.adminUserId,
        title: 'Excessive Data Exports',
        description: `Admin user performed ${exportsToday} data exports today, exceeding the limit of ${this.config.maxDataExportsPerDay}`,
        metadata: {
          exportsToday,
          limit: this.config.maxDataExportsPerDay,
          exportType: auditLog.action,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Check for after-hours access
   */
  private async checkAfterHoursAccess(auditLog: AuditLog): Promise<void> {
    const hour = auditLog.timestamp.getHours();
    
    if (hour >= this.config.businessHoursStart && hour <= this.config.businessHoursEnd) {
      return; // Within business hours
    }

    // Check if this is a sensitive action
    if (this.config.sensitiveActions.includes(auditLog.action)) {
      await this.createAlert({
        type: SecurityAlertType.AFTER_HOURS_ACCESS,
        severity: AlertSeverity.MEDIUM,
        adminUserId: auditLog.adminUserId,
        title: 'After-Hours Sensitive Action',
        description: `Admin user performed sensitive action "${auditLog.action}" outside business hours`,
        metadata: {
          action: auditLog.action,
          hour,
          businessHours: `${this.config.businessHoursStart}-${this.config.businessHoursEnd}`,
          entityType: auditLog.entityType,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Check for high volume of actions
   */
  private async checkHighVolumeActions(auditLog: AuditLog): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const actionsLastHour = await this.auditLogModel.countDocuments({
      adminUserId: auditLog.adminUserId,
      timestamp: { $gte: oneHourAgo },
    });

    if (actionsLastHour > this.config.maxActionsPerHour) {
      await this.createAlert({
        type: SecurityAlertType.HIGH_VOLUME_ACTIONS,
        severity: AlertSeverity.MEDIUM,
        adminUserId: auditLog.adminUserId,
        title: 'High Volume of Actions',
        description: `Admin user performed ${actionsLastHour} actions in the last hour, exceeding the limit of ${this.config.maxActionsPerHour}`,
        metadata: {
          actionsLastHour,
          limit: this.config.maxActionsPerHour,
          currentAction: auditLog.action,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Check for sensitive data access
   */
  private async checkSensitiveDataAccess(auditLog: AuditLog): Promise<void> {
    if (!this.config.sensitiveActions.includes(auditLog.action)) {
      return;
    }

    // Log all sensitive actions for monitoring
    this.logger.warn(`Sensitive action performed: ${auditLog.action} by admin ${auditLog.adminUserId}`);

    // Check for multiple sensitive actions in short time
    const recentSensitiveActions = await this.auditLogModel.countDocuments({
      adminUserId: auditLog.adminUserId,
      action: { $in: this.config.sensitiveActions },
      timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
    });

    if (recentSensitiveActions > 3) {
      await this.createAlert({
        type: SecurityAlertType.SENSITIVE_DATA_ACCESS,
        severity: AlertSeverity.HIGH,
        adminUserId: auditLog.adminUserId,
        title: 'Multiple Sensitive Actions',
        description: `Admin user performed ${recentSensitiveActions} sensitive actions in the last 10 minutes`,
        metadata: {
          sensitiveActionsCount: recentSensitiveActions,
          currentAction: auditLog.action,
          entityType: auditLog.entityType,
        },
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Create a security alert
   */
  private async createAlert(alert: SecurityAlert): Promise<void> {
    const alertId = new Types.ObjectId().toString();
    alert.id = alertId;
    
    this.alerts.set(alertId, alert);
    
    this.logger.warn(`Security alert created: ${alert.type} - ${alert.title}`);

    // Send notification if configured
    if (this.shouldNotifyForSeverity(alert.severity)) {
      await this.adminNotificationService.sendSecurityAlert(alert);
    }

    // Store alert in database (you might want to create a SecurityAlert schema)
    // For now, we'll log it as an audit entry
    // await this.auditLogService.logAction({
    //   adminUserId: alert.adminUserId,
    //   action: AdminAction.SYSTEM_CONFIGURATION,
    //   entityType: 'SecurityAlert',
    //   entityId: new Types.ObjectId(alertId),
    //   description: `Security alert: ${alert.title}`,
    //   metadata: alert.metadata,
    // });
  }

  /**
   * Get all security alerts
   */
  getAlerts(filters?: {
    severity?: AlertSeverity;
    type?: SecurityAlertType;
    resolved?: boolean;
    adminUserId?: string;
  }): SecurityAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      if (filters.severity) {
        alerts = alerts.filter(alert => alert.severity === filters.severity);
      }
      if (filters.type) {
        alerts = alerts.filter(alert => alert.type === filters.type);
      }
      if (filters.resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === filters.resolved);
      }
      if (filters.adminUserId) {
        alerts = alerts.filter(alert => alert.adminUserId.toString() === filters.adminUserId);
      }
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Resolve a security alert
   */
  async resolveAlert(alertId: string, resolvedBy: string, notes?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.resolved = true;
    alert.resolvedBy = new Types.ObjectId(resolvedBy);
    alert.resolvedAt = new Date();
    alert.resolutionNotes = notes;

    this.logger.log(`Security alert resolved: ${alertId} by ${resolvedBy}`);
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(): {
    totalAlerts: number;
    alertsBySeverity: Record<AlertSeverity, number>;
    alertsByType: Record<SecurityAlertType, number>;
    unresolvedAlerts: number;
    alertsLast24Hours: number;
  } {
    const alerts = Array.from(this.alerts.values());
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const alertsBySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<AlertSeverity, number>);

    const alertsByType = alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<SecurityAlertType, number>);

    return {
      totalAlerts: alerts.length,
      alertsBySeverity,
      alertsByType,
      unresolvedAlerts: alerts.filter(alert => !alert.resolved).length,
      alertsLast24Hours: alerts.filter(alert => alert.timestamp >= last24Hours).length,
    };
  }

  /**
   * Start periodic monitoring processes
   */
  private startPeriodicMonitoring(): void {
    // Run security checks every 5 minutes
    setInterval(async () => {
      try {
        await this.performPeriodicSecurityChecks();
      } catch (error) {
        this.logger.error('Error in periodic security checks:', error);
      }
    }, 5 * 60 * 1000);

    // Clean up old alerts every hour
    setInterval(() => {
      this.cleanupOldAlerts();
    }, 60 * 60 * 1000);
  }

  /**
   * Perform periodic security checks
   */
  private async performPeriodicSecurityChecks(): Promise<void> {
    // Check for dormant admin accounts that suddenly become active
    await this.checkDormantAccountActivity();
    
    // Check for geographic anomalies if enabled
    if (this.config.enableGeographicMonitoring) {
      await this.checkGeographicAnomalies();
    }
  }

  /**
   * Check for dormant account activity
   */
  private async checkDormantAccountActivity(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find admin users who were inactive for 30 days but active in last 24 hours
    const recentlyActiveAdmins = await this.auditLogModel.aggregate([
      {
        $match: {
          timestamp: { $gte: oneDayAgo },
        },
      },
      {
        $group: {
          _id: '$adminUserId',
          recentActions: { $sum: 1 },
        },
      },
    ]);

    for (const admin of recentlyActiveAdmins) {
      const oldActivity = await this.auditLogModel.countDocuments({
        adminUserId: admin._id,
        timestamp: { $gte: thirtyDaysAgo, $lt: oneDayAgo },
      });

      if (oldActivity === 0 && admin.recentActions > 5) {
        await this.createAlert({
          type: SecurityAlertType.UNUSUAL_ACTIVITY_PATTERN,
          severity: AlertSeverity.MEDIUM,
          adminUserId: admin._id,
          title: 'Dormant Account Suddenly Active',
          description: `Admin account that was inactive for 30 days suddenly performed ${admin.recentActions} actions`,
          metadata: {
            recentActions: admin.recentActions,
            dormantPeriod: 30,
          },
          timestamp: new Date(),
          resolved: false,
        });
      }
    }
  }

  /**
   * Check for geographic anomalies
   */
  private async checkGeographicAnomalies(): Promise<void> {
    // This would require IP geolocation service integration
    // For now, we'll just log that the check would happen here
    this.logger.debug('Geographic anomaly check would run here with IP geolocation service');
  }

  /**
   * Clean up old resolved alerts
   */
  private cleanupOldAlerts(): void {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt < sevenDaysAgo) {
        this.alerts.delete(alertId);
      }
    }
  }

  /**
   * Check if notification should be sent for given severity
   */
  private shouldNotifyForSeverity(severity: AlertSeverity): boolean {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return this.config.notifyOnCritical;
      case AlertSeverity.HIGH:
        return this.config.notifyOnHigh;
      default:
        return false;
    }
  }
}
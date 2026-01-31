import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { EmailService } from '../../../common/services/email.service';
import { SecurityAlert, AlertSeverity } from './security-monitoring.service';
import { AdminWebSocketService } from './admin-websocket.service';

/**
 * Notification types for admin alerts
 */
export enum AdminNotificationType {
  SECURITY_ALERT = 'security_alert',
  SYSTEM_ALERT = 'system_alert',
  MAINTENANCE_ALERT = 'maintenance_alert',
  PERFORMANCE_ALERT = 'performance_alert',
}

/**
 * Admin notification interface
 */
export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  severity: AlertSeverity;
  title: string;
  message: string;
  recipients: string[];
  metadata?: Record<string, any>;
  sentAt?: Date;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  retryCount: number;
}

/**
 * Admin notification service for sending alerts and notifications to administrators
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);
  private notifications: Map<string, AdminNotification> = new Map();

  constructor(
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => AdminWebSocketService))
    private readonly webSocketService: AdminWebSocketService,
  ) {}

  /**
   * Send security alert notification
   */
  async sendSecurityAlert(alert: SecurityAlert): Promise<void> {
    const notification: AdminNotification = {
      id: `security_${alert.id}_${Date.now()}`,
      type: AdminNotificationType.SECURITY_ALERT,
      severity: alert.severity,
      title: `Security Alert: ${alert.title}`,
      message: this.formatSecurityAlertMessage(alert),
      recipients: this.getSecurityAlertRecipients(alert.severity),
      metadata: {
        alertId: alert.id,
        alertType: alert.type,
        adminUserId: alert.adminUserId.toString(),
        ...alert.metadata,
      },
      deliveryStatus: 'pending',
      retryCount: 0,
    };

    await this.sendNotification(notification);
  }

  /**
   * Send system alert notification
   */
  async sendSystemAlert(
    title: string,
    message: string,
    severity: AlertSeverity = AlertSeverity.MEDIUM,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notification: AdminNotification = {
      id: `system_${Date.now()}`,
      type: AdminNotificationType.SYSTEM_ALERT,
      severity,
      title: `System Alert: ${title}`,
      message,
      recipients: this.getSystemAlertRecipients(severity),
      metadata,
      deliveryStatus: 'pending',
      retryCount: 0,
    };

    await this.sendNotification(notification);
  }

  /**
   * Send maintenance alert notification
   */
  async sendMaintenanceAlert(
    title: string,
    message: string,
    scheduledTime?: Date,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notification: AdminNotification = {
      id: `maintenance_${Date.now()}`,
      type: AdminNotificationType.MAINTENANCE_ALERT,
      severity: AlertSeverity.LOW,
      title: `Maintenance Alert: ${title}`,
      message,
      recipients: this.getMaintenanceAlertRecipients(),
      metadata: {
        scheduledTime: scheduledTime?.toISOString(),
        ...metadata,
      },
      deliveryStatus: 'pending',
      retryCount: 0,
    };

    await this.sendNotification(notification);
  }

  /**
   * Send performance alert notification
   */
  async sendPerformanceAlert(
    title: string,
    message: string,
    severity: AlertSeverity = AlertSeverity.MEDIUM,
    metrics?: Record<string, any>,
  ): Promise<void> {
    const notification: AdminNotification = {
      id: `performance_${Date.now()}`,
      type: AdminNotificationType.PERFORMANCE_ALERT,
      severity,
      title: `Performance Alert: ${title}`,
      message,
      recipients: this.getPerformanceAlertRecipients(severity),
      metadata: {
        metrics,
        timestamp: new Date().toISOString(),
      },
      deliveryStatus: 'pending',
      retryCount: 0,
    };

    await this.sendNotification(notification);
  }

  /**
   * Send notification via configured channels
   */
  private async sendNotification(notification: AdminNotification): Promise<void> {
    this.notifications.set(notification.id, notification);

    try {
      // Send email notifications
      await this.sendEmailNotification(notification);
      
      // Send WebSocket notifications for real-time updates
      await this.sendWebSocketNotification(notification);
      
      // Here you could add other notification channels like:
      // - Slack notifications
      // - SMS notifications
      // - Push notifications
      // - Webhook notifications

      notification.deliveryStatus = 'sent';
      notification.sentAt = new Date();
      
      this.logger.log(`Notification sent successfully: ${notification.id}`);
    } catch (error) {
      notification.deliveryStatus = 'failed';
      notification.retryCount++;
      
      this.logger.error(`Failed to send notification ${notification.id}:`, error);
      
      // Retry logic for failed notifications
      if (notification.retryCount < 3) {
        setTimeout(() => {
          this.retryNotification(notification.id);
        }, Math.pow(2, notification.retryCount) * 1000); // Exponential backoff
      }
    }
  }

  /**
   * Send WebSocket notification for real-time updates
   */
  private async sendWebSocketNotification(notification: AdminNotification): Promise<void> {
    if (!this.webSocketService || !this.webSocketService.isAvailable()) {
      this.logger.warn('WebSocket service not available, skipping real-time notification');
      return;
    }

    try {
      // Broadcast to all admin users for critical alerts
      if (notification.severity === AlertSeverity.CRITICAL || notification.severity === AlertSeverity.HIGH) {
        await this.webSocketService.broadcastToAllAdmins({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          severity: this.mapSeverityToWebSocket(notification.severity),
          data: notification.metadata,
        });
      }
    } catch (error) {
      this.logger.error('Failed to send WebSocket notification:', error);
      // Don't throw - email notification is primary channel
    }
  }

  /**
   * Map alert severity to WebSocket severity
   */
  private mapSeverityToWebSocket(severity: AlertSeverity): 'info' | 'warning' | 'error' | 'success' {
    switch (severity) {
      case AlertSeverity.CRITICAL:
      case AlertSeverity.HIGH:
        return 'error';
      case AlertSeverity.MEDIUM:
        return 'warning';
      case AlertSeverity.LOW:
      default:
        return 'info';
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: AdminNotification): Promise<void> {
    if (notification.recipients.length === 0) {
      this.logger.warn(`No recipients configured for notification: ${notification.id}`);
      return;
    }

    const emailTemplate = this.getEmailTemplate(notification);
    
    for (const recipient of notification.recipients) {
      try {
        await this.emailService.sendGenericEmail({
          to: recipient,
          subject: notification.title,
          html: emailTemplate.html,
          text: emailTemplate.text,
        });
      } catch (error) {
        this.logger.error(`Failed to send email to ${recipient}:`, error);
        throw error;
      }
    }
  }

  /**
   * Retry failed notification
   */
  private async retryNotification(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.deliveryStatus === 'sent') {
      return;
    }

    this.logger.log(`Retrying notification: ${notificationId} (attempt ${notification.retryCount + 1})`);
    await this.sendNotification(notification);
  }

  /**
   * Format security alert message
   */
  private formatSecurityAlertMessage(alert: SecurityAlert): string {
    let message = `Security Alert: ${alert.description}\n\n`;
    message += `Alert Type: ${alert.type}\n`;
    message += `Severity: ${alert.severity.toUpperCase()}\n`;
    message += `Admin User ID: ${alert.adminUserId}\n`;
    message += `Timestamp: ${alert.timestamp.toISOString()}\n\n`;

    if (alert.metadata) {
      message += 'Additional Details:\n';
      for (const [key, value] of Object.entries(alert.metadata)) {
        message += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    message += '\nPlease investigate this alert immediately and take appropriate action.';
    
    return message;
  }

  /**
   * Get email template for notification
   */
  private getEmailTemplate(notification: AdminNotification): { html: string; text: string } {
    const severityColor = this.getSeverityColor(notification.severity);
    const timestamp = new Date().toLocaleString();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${notification.title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background-color: ${severityColor}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .metadata { background-color: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; }
            .severity { font-weight: bold; color: ${severityColor}; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${notification.title}</h1>
            <p class="severity">Severity: ${notification.severity.toUpperCase()}</p>
          </div>
          <div class="content">
            <p>${notification.message.replace(/\n/g, '<br>')}</p>
            ${notification.metadata ? this.formatMetadataHtml(notification.metadata) : ''}
          </div>
          <div class="footer">
            <p>Chabaqa Admin System - ${timestamp}</p>
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </body>
      </html>
    `;

    const text = `
${notification.title}

Severity: ${notification.severity.toUpperCase()}

${notification.message}

${notification.metadata ? this.formatMetadataText(notification.metadata) : ''}

---
Chabaqa Admin System - ${timestamp}
This is an automated notification.
    `.trim();

    return { html, text };
  }

  /**
   * Format metadata as HTML
   */
  private formatMetadataHtml(metadata: Record<string, any>): string {
    let html = '<div class="metadata"><h3>Additional Information:</h3><ul>';
    
    for (const [key, value] of Object.entries(metadata)) {
      html += `<li><strong>${key}:</strong> ${this.formatMetadataValue(value)}</li>`;
    }
    
    html += '</ul></div>';
    return html;
  }

  /**
   * Format metadata as plain text
   */
  private formatMetadataText(metadata: Record<string, any>): string {
    let text = '\nAdditional Information:\n';
    
    for (const [key, value] of Object.entries(metadata)) {
      text += `- ${key}: ${this.formatMetadataValue(value)}\n`;
    }
    
    return text;
  }

  /**
   * Format metadata value for display
   */
  private formatMetadataValue(value: any): string {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return '#dc3545'; // Red
      case AlertSeverity.HIGH:
        return '#fd7e14'; // Orange
      case AlertSeverity.MEDIUM:
        return '#ffc107'; // Yellow
      case AlertSeverity.LOW:
        return '#28a745'; // Green
      default:
        return '#6c757d'; // Gray
    }
  }

  /**
   * Get recipients for security alerts based on severity
   */
  private getSecurityAlertRecipients(severity: AlertSeverity): string[] {
    // In a real implementation, this would come from configuration
    const recipients: string[] = [];
    
    // Add security team for all security alerts
    recipients.push('security@chabaqa.com');
    
    // Add additional recipients based on severity
    switch (severity) {
      case AlertSeverity.CRITICAL:
        recipients.push('cto@chabaqa.com', 'admin@chabaqa.com');
        break;
      case AlertSeverity.HIGH:
        recipients.push('admin@chabaqa.com');
        break;
    }
    
    return recipients;
  }

  /**
   * Get recipients for system alerts
   */
  private getSystemAlertRecipients(severity: AlertSeverity): string[] {
    const recipients = ['devops@chabaqa.com'];
    
    if (severity === AlertSeverity.CRITICAL || severity === AlertSeverity.HIGH) {
      recipients.push('admin@chabaqa.com');
    }
    
    return recipients;
  }

  /**
   * Get recipients for maintenance alerts
   */
  private getMaintenanceAlertRecipients(): string[] {
    return ['admin@chabaqa.com', 'devops@chabaqa.com'];
  }

  /**
   * Get recipients for performance alerts
   */
  private getPerformanceAlertRecipients(severity: AlertSeverity): string[] {
    const recipients = ['devops@chabaqa.com'];
    
    if (severity === AlertSeverity.CRITICAL) {
      recipients.push('admin@chabaqa.com');
    }
    
    return recipients;
  }

  /**
   * Get all notifications
   */
  getNotifications(filters?: {
    type?: AdminNotificationType;
    severity?: AlertSeverity;
    deliveryStatus?: 'pending' | 'sent' | 'failed';
  }): AdminNotification[] {
    let notifications = Array.from(this.notifications.values());

    if (filters) {
      if (filters.type) {
        notifications = notifications.filter(n => n.type === filters.type);
      }
      if (filters.severity) {
        notifications = notifications.filter(n => n.severity === filters.severity);
      }
      if (filters.deliveryStatus) {
        notifications = notifications.filter(n => n.deliveryStatus === filters.deliveryStatus);
      }
    }

    return notifications.sort((a, b) => {
      const aTime = a.sentAt || new Date(0);
      const bTime = b.sentAt || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });
  }

  /**
   * Get notification statistics
   */
  getNotificationStatistics(): {
    total: number;
    byType: Record<AdminNotificationType, number>;
    bySeverity: Record<AlertSeverity, number>;
    byStatus: Record<string, number>;
    last24Hours: number;
  } {
    const notifications = Array.from(this.notifications.values());
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const byType = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<AdminNotificationType, number>);

    const bySeverity = notifications.reduce((acc, n) => {
      acc[n.severity] = (acc[n.severity] || 0) + 1;
      return acc;
    }, {} as Record<AlertSeverity, number>);

    const byStatus = notifications.reduce((acc, n) => {
      acc[n.deliveryStatus] = (acc[n.deliveryStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: notifications.length,
      byType,
      bySeverity,
      byStatus,
      last24Hours: notifications.filter(n => 
        (n.sentAt || new Date(0)) >= last24Hours
      ).length,
    };
  }

  /**
   * Clear old notifications (cleanup)
   */
  clearOldNotifications(olderThanDays: number = 30): void {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    for (const [id, notification] of this.notifications.entries()) {
      const notificationDate = notification.sentAt || new Date(0);
      if (notificationDate < cutoffDate) {
        this.notifications.delete(id);
      }
    }
    
    this.logger.log(`Cleared notifications older than ${olderThanDays} days`);
  }
}
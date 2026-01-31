import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { DmGateway } from '../../../dm/dm.gateway';

/**
 * AdminWebSocketService handles real-time notifications for admin users
 * Integrates with existing WebSocket infrastructure (DmGateway)
 */
@Injectable()
export class AdminWebSocketService {
  private readonly logger = new Logger(AdminWebSocketService.name);
  private server: Server | null = null;

  constructor(
    private readonly dmGateway: DmGateway,
  ) {
    // Get WebSocket server from DmGateway
    if (this.dmGateway && this.dmGateway.server) {
      this.server = this.dmGateway.server;
      this.logger.log('✅ Admin WebSocket service initialized with existing WebSocket server');
    } else {
      this.logger.warn('⚠️ WebSocket server not available, real-time notifications disabled');
    }
  }

  /**
   * Send notification to specific admin user
   * @param adminUserId - Admin user ID
   * @param notification - Notification data
   */
  async sendNotificationToAdmin(
    adminUserId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      severity?: 'info' | 'warning' | 'error' | 'success';
      data?: any;
      timestamp?: Date;
    }
  ): Promise<void> {
    if (!this.server) {
      this.logger.warn('WebSocket server not available, notification not sent');
      return;
    }

    try {
      const notificationData = {
        ...notification,
        timestamp: notification.timestamp || new Date(),
        severity: notification.severity || 'info',
      };

      // Send to admin user's room
      this.server.to(`user:${adminUserId}`).emit('admin:notification', notificationData);
      
      this.logger.log(`Notification sent to admin user ${adminUserId}: ${notification.type}`);
    } catch (error) {
      this.logger.error(`Failed to send notification to admin ${adminUserId}:`, error);
    }
  }

  /**
   * Broadcast notification to all admin users
   * @param notification - Notification data
   */
  async broadcastToAllAdmins(
    notification: {
      type: string;
      title: string;
      message: string;
      severity?: 'info' | 'warning' | 'error' | 'success';
      data?: any;
      timestamp?: Date;
    }
  ): Promise<void> {
    if (!this.server) {
      this.logger.warn('WebSocket server not available, broadcast not sent');
      return;
    }

    try {
      const notificationData = {
        ...notification,
        timestamp: notification.timestamp || new Date(),
        severity: notification.severity || 'info',
      };

      // Broadcast to admin namespace
      this.server.emit('admin:broadcast', notificationData);
      
      this.logger.log(`Broadcast sent to all admins: ${notification.type}`);
    } catch (error) {
      this.logger.error('Failed to broadcast to admins:', error);
    }
  }

  /**
   * Send security alert to all admin users
   * @param alert - Security alert data
   */
  async sendSecurityAlert(alert: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    adminUserId?: string;
    ipAddress?: string;
    details?: any;
  }): Promise<void> {
    await this.broadcastToAllAdmins({
      type: 'security_alert',
      title: 'Security Alert',
      message: alert.message,
      severity: alert.severity === 'critical' || alert.severity === 'high' ? 'error' : 'warning',
      data: {
        alertType: alert.type,
        severity: alert.severity,
        adminUserId: alert.adminUserId,
        ipAddress: alert.ipAddress,
        details: alert.details,
      },
    });
  }

  /**
   * Send system status update to all admin users
   * @param status - System status data
   */
  async sendSystemStatusUpdate(status: {
    type: 'maintenance' | 'outage' | 'recovery' | 'update';
    message: string;
    affectedServices?: string[];
    estimatedDuration?: string;
  }): Promise<void> {
    await this.broadcastToAllAdmins({
      type: 'system_status',
      title: 'System Status Update',
      message: status.message,
      severity: status.type === 'outage' ? 'error' : 'info',
      data: status,
    });
  }

  /**
   * Send audit log notification
   * @param adminUserId - Admin user ID
   * @param action - Action performed
   * @param entityType - Entity type
   * @param entityId - Entity ID
   */
  async sendAuditLogNotification(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string
  ): Promise<void> {
    await this.sendNotificationToAdmin(adminUserId, {
      type: 'audit_log',
      title: 'Action Logged',
      message: `${action} performed on ${entityType}`,
      severity: 'info',
      data: {
        action,
        entityType,
        entityId,
      },
    });
  }

  /**
   * Send bulk operation progress update
   * @param adminUserId - Admin user ID
   * @param operationId - Operation ID
   * @param progress - Progress percentage (0-100)
   * @param status - Operation status
   */
  async sendBulkOperationProgress(
    adminUserId: string,
    operationId: string,
    progress: number,
    status: 'in_progress' | 'completed' | 'failed'
  ): Promise<void> {
    await this.sendNotificationToAdmin(adminUserId, {
      type: 'bulk_operation_progress',
      title: 'Bulk Operation Update',
      message: `Operation ${status}: ${progress}% complete`,
      severity: status === 'failed' ? 'error' : status === 'completed' ? 'success' : 'info',
      data: {
        operationId,
        progress,
        status,
      },
    });
  }

  /**
   * Send export job completion notification
   * @param adminUserId - Admin user ID
   * @param exportId - Export job ID
   * @param downloadUrl - Download URL
   */
  async sendExportCompletionNotification(
    adminUserId: string,
    exportId: string,
    downloadUrl: string
  ): Promise<void> {
    await this.sendNotificationToAdmin(adminUserId, {
      type: 'export_complete',
      title: 'Export Ready',
      message: 'Your data export is ready for download',
      severity: 'success',
      data: {
        exportId,
        downloadUrl,
      },
    });
  }

  /**
   * Check if WebSocket server is available
   */
  isAvailable(): boolean {
    return this.server !== null;
  }

  /**
   * Get WebSocket server instance
   */
  getServer(): Server | null {
    return this.server;
  }
}

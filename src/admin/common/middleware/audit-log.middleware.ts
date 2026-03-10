import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuditLogService, AuditLogEntry } from '../services/audit-log.service';
import { SecurityMonitoringService } from '../services/security-monitoring.service';
import { AdminAction } from '../../schemas/audit-log.schema';
import { Types } from 'mongoose';

/**
 * Extended Request interface to include admin user information
 */
interface AdminRequest extends Request {
  user?: {
    id: string;
    adminUserId?: string;
    roles?: string[];
  };
  adminAction?: AdminAction;
  entityType?: string;
  entityId?: string;
  auditMetadata?: Record<string, any>;
}

/**
 * Middleware to automatically log all admin actions for audit purposes
 * Captures request/response data, user information, and action context
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditLogMiddleware.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  async use(req: AdminRequest, res: Response, next: NextFunction) {
    // Skip audit logging for non-admin routes
    if (!req.path.startsWith('/api/admin')) {
      return next();
    }

    // Skip audit logging for health checks and static assets
    if (this.shouldSkipAudit(req.path, req.method)) {
      return next();
    }

    const startTime = Date.now();
    const originalSend = res.send;
    let responseData: any;

    // Capture response data
    res.send = function(data: any) {
      responseData = data;
      return originalSend.call(this, data);
    };

    // Continue with the request
    res.on('finish', async () => {
      try {
        await this.logAdminAction(req, res, responseData, startTime);
      } catch (error) {
        this.logger.error('Failed to log admin action:', error);
        // Don't throw error to avoid breaking the main request
      }
    });

    next();
  }

  /**
   * Log the admin action with comprehensive details
   */
  private async logAdminAction(
    req: AdminRequest,
    res: Response,
    responseData: any,
    startTime: number,
  ): Promise<void> {
    // Skip if no user information available
    if (!req.user?.adminUserId) {
      return;
    }

    const action = this.determineAction(req);
    const { entityType, entityId } = this.extractEntityInfo(req);
    const duration = Date.now() - startTime;

    const auditEntry: AuditLogEntry = {
      adminUserId: new Types.ObjectId(req.user.adminUserId),
      action,
      entityType,
      entityId: entityId ? new Types.ObjectId(entityId) : new Types.ObjectId(),
      ipAddress: this.getClientIp(req),
      userAgent: req.get('User-Agent') || 'Unknown',
      requestData: this.sanitizeRequestData(req),
      responseData: this.sanitizeResponseData(responseData),
      status: this.determineStatus(res.statusCode),
      description: this.generateDescription(action, req.method, req.path),
      metadata: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString(),
        ...req.auditMetadata,
      },
    };

    // Add error information if request failed
    if (res.statusCode >= 400) {
      auditEntry.errorMessage = this.extractErrorMessage(responseData);
    }

    await this.auditLogService.logAction(auditEntry);

    // Monitor the action for security threats
    try {
      await this.securityMonitoringService.monitorAction(auditEntry as any);
    } catch (error) {
      this.logger.error('Failed to monitor action for security threats:', error);
      // Don't throw error to avoid breaking the main request
    }
  }

  /**
   * Determine the admin action based on request details
   */
  private determineAction(req: AdminRequest): AdminAction {
    // Use explicitly set action if available
    if (req.adminAction) {
      return req.adminAction;
    }

    const { method, path } = req;
    const pathSegments = path.split('/').filter(Boolean);

    // Extract action from path and method
    if (pathSegments.includes('users')) {
      if (method === 'GET' && pathSegments.includes('search')) {
        return AdminAction.USER_SEARCH;
      }
      if (method === 'GET') {
        return AdminAction.USER_VIEW_DETAILS;
      }
      if (method === 'PUT' && pathSegments.includes('suspend')) {
        return AdminAction.USER_SUSPEND;
      }
      if (method === 'PUT' && pathSegments.includes('activate')) {
        return AdminAction.USER_ACTIVATE;
      }
      if (method === 'POST' && pathSegments.includes('reset-password')) {
        return AdminAction.USER_PASSWORD_RESET;
      }
    }

    if (pathSegments.includes('communities')) {
      if (method === 'PUT' && pathSegments.includes('approve')) {
        return AdminAction.COMMUNITY_APPROVE;
      }
      if (method === 'PUT' && pathSegments.includes('reject')) {
        return AdminAction.COMMUNITY_REJECT;
      }
      if (method === 'GET') {
        return AdminAction.COMMUNITY_VIEW;
      }
      if (method === 'PUT') {
        return AdminAction.COMMUNITY_MODERATE;
      }
    }

    if (pathSegments.includes('content')) {
      if (method === 'PUT' && pathSegments.includes('approve')) {
        return AdminAction.CONTENT_APPROVE;
      }
      if (method === 'PUT' && pathSegments.includes('reject')) {
        return AdminAction.CONTENT_REJECT;
      }
      if (method === 'POST' && pathSegments.includes('bulk')) {
        return AdminAction.CONTENT_BULK_MODERATE;
      }
      if (method === 'GET') {
        return AdminAction.CONTENT_VIEW;
      }
    }

    if (pathSegments.includes('financial')) {
      if (method === 'POST' && pathSegments.includes('payout')) {
        return AdminAction.PAYOUT_PROCESS;
      }
      if (method === 'PUT' && pathSegments.includes('dispute')) {
        return AdminAction.DISPUTE_HANDLE;
      }
      if (method === 'GET' && pathSegments.includes('report')) {
        return AdminAction.FINANCIAL_REPORT_GENERATE;
      }
      if (method === 'GET') {
        return AdminAction.FINANCIAL_VIEW;
      }
    }

    if (pathSegments.includes('analytics')) {
      return AdminAction.ANALYTICS_VIEW;
    }

    if (pathSegments.includes('export')) {
      return AdminAction.DATA_EXPORT;
    }

    if (pathSegments.includes('security') || pathSegments.includes('audit')) {
      if (method === 'GET' && pathSegments.includes('export')) {
        return AdminAction.AUDIT_LOG_EXPORT;
      }
      return AdminAction.AUDIT_LOG_VIEW;
    }

    if (pathSegments.includes('communications')) {
      if (method === 'POST' && pathSegments.includes('campaign')) {
        return AdminAction.EMAIL_CAMPAIGN_CREATE;
      }
      if (method === 'POST' && pathSegments.includes('send')) {
        return AdminAction.EMAIL_CAMPAIGN_SEND;
      }
      if (method === 'POST' && pathSegments.includes('bulk-message')) {
        return AdminAction.BULK_MESSAGE_SEND;
      }
      return AdminAction.NOTIFICATION_CONFIGURE;
    }

    // Default action for bulk operations
    if (pathSegments.includes('bulk')) {
      return AdminAction.BULK_OPERATION;
    }

    // Default system configuration action
    return AdminAction.SYSTEM_CONFIGURATION;
  }

  /**
   * Extract entity information from request
   */
  private extractEntityInfo(req: AdminRequest): { entityType: string; entityId?: string } {
    // Use explicitly set entity info if available
    if (req.entityType) {
      return {
        entityType: req.entityType,
        entityId: req.entityId,
      };
    }

    const pathSegments = req.path.split('/').filter(Boolean);
    
    // Extract from path segments
    if (pathSegments.includes('users')) {
      const userIdIndex = pathSegments.indexOf('users') + 1;
      return {
        entityType: 'User',
        entityId: pathSegments[userIdIndex] !== 'search' ? pathSegments[userIdIndex] : undefined,
      };
    }

    if (pathSegments.includes('communities')) {
      const communityIdIndex = pathSegments.indexOf('communities') + 1;
      return {
        entityType: 'Community',
        entityId: pathSegments[communityIdIndex],
      };
    }

    if (pathSegments.includes('content')) {
      const contentIdIndex = pathSegments.indexOf('content') + 1;
      return {
        entityType: 'Content',
        entityId: pathSegments[contentIdIndex],
      };
    }

    // Extract from request body or query parameters
    const entityId = req.params?.id || req.body?.id || req.query?.id;
    
    return {
      entityType: 'System',
      entityId: entityId as string,
    };
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Sanitize request data for logging (remove sensitive information)
   */
  private sanitizeRequestData(req: AdminRequest): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    
    const sanitized: Record<string, any> = {
      method: req.method,
      path: req.path,
      query: { ...req.query },
      params: { ...req.params },
      body: { ...req.body },
    };

    // Remove sensitive fields
    this.removeSensitiveFields(sanitized, sensitiveFields);

    return sanitized;
  }

  /**
   * Sanitize response data for logging
   */
  private sanitizeResponseData(responseData: any): Record<string, any> {
    if (!responseData) return {};

    try {
      const parsed = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
      const sensitiveFields = ['password', 'token', 'secret', 'key'];
      
      const sanitized = { ...parsed };
      this.removeSensitiveFields(sanitized, sensitiveFields);
      
      return sanitized;
    } catch (error) {
      return { raw: String(responseData).substring(0, 1000) }; // Limit size
    }
  }

  /**
   * Remove sensitive fields from object recursively
   */
  private removeSensitiveFields(obj: any, sensitiveFields: string[]): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.removeSensitiveFields(obj[key], sensitiveFields);
      }
    }
  }

  /**
   * Determine status from HTTP status code
   */
  private determineStatus(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) {
      return 'success';
    } else if (statusCode >= 400 && statusCode < 500) {
      return 'failed';
    } else if (statusCode >= 500) {
      return 'error';
    }
    return 'unknown';
  }

  /**
   * Generate human-readable description of the action
   */
  private generateDescription(action: AdminAction, method: string, path: string): string {
    const actionDescriptions: Record<AdminAction, string> = {
      [AdminAction.USER_CREATE]: 'Created new user',
      [AdminAction.USER_SUSPEND]: 'Suspended user account',
      [AdminAction.USER_ACTIVATE]: 'Activated user account',
      [AdminAction.USER_PASSWORD_RESET]: 'Reset user password',
      [AdminAction.USER_VIEW_DETAILS]: 'Viewed user details',
      [AdminAction.USER_SEARCH]: 'Searched users',
      [AdminAction.USER_LIST]: 'Listed users',
      [AdminAction.USER_VIEW]: 'Viewed user',
      [AdminAction.USER_UPDATE]: 'Updated user',
      [AdminAction.USER_DELETE]: 'Deleted user',
      [AdminAction.COMMUNITY_APPROVE]: 'Approved community',
      [AdminAction.COMMUNITY_REJECT]: 'Rejected community',
      [AdminAction.COMMUNITY_VIEW]: 'Viewed community details',
      [AdminAction.COMMUNITY_MODERATE]: 'Moderated community settings',
      [AdminAction.CONTENT_APPROVE]: 'Approved content',
      [AdminAction.CONTENT_REJECT]: 'Rejected content',
      [AdminAction.CONTENT_SUSPEND]: 'Suspended content',
      [AdminAction.CONTENT_FEATURE]: 'Featured content',
      [AdminAction.CONTENT_UNFEATURE]: 'Unfeatured content',
      [AdminAction.CONTENT_HIDE]: 'Hidden content',
      [AdminAction.CONTENT_RESTORE]: 'Restored content',
      [AdminAction.CONTENT_DELETE]: 'Deleted content',
      [AdminAction.CONTENT_UPDATE]: 'Updated content',
      [AdminAction.CONTENT_CANCEL]: 'Cancelled content',
      [AdminAction.CONTENT_NOTIFY]: 'Notified content participants',
      [AdminAction.CONTENT_FLAG]: 'Flagged content',
      [AdminAction.CONTENT_ESCALATE]: 'Escalated content',
      [AdminAction.CONTENT_MODERATE]: 'Moderated content',
      [AdminAction.CONTENT_VIEW]: 'Viewed content details',
      [AdminAction.CONTENT_MODERATION_VIEW]: 'Viewed content moderation details',
      [AdminAction.CONTENT_MODERATION_QUEUE_VIEW]: 'Viewed content moderation queue',
      [AdminAction.CONTENT_BULK_MODERATE]: 'Performed bulk content moderation',
      [AdminAction.CONTENT_BULK_MODERATION]: 'Performed bulk content moderation',
      [AdminAction.CONTENT_PRIORITY_UPDATE]: 'Updated content priority',
      [AdminAction.CONTENT_ASSIGNMENT]: 'Assigned content to moderator',
      [AdminAction.PAYOUT_PROCESS]: 'Processed creator payout',
      [AdminAction.FINANCIAL_VIEW]: 'Viewed financial data',
      [AdminAction.DISPUTE_HANDLE]: 'Handled payment dispute',
      [AdminAction.FINANCIAL_REPORT_GENERATE]: 'Generated financial report',
      [AdminAction.ANALYTICS_VIEW]: 'Viewed analytics dashboard',
      [AdminAction.DATA_EXPORT]: 'Exported data',
      [AdminAction.ALERT_CONFIGURE]: 'Configured system alert',
      [AdminAction.AUDIT_LOG_VIEW]: 'Viewed audit logs',
      [AdminAction.AUDIT_LOG_EXPORT]: 'Exported audit logs',
      [AdminAction.ADMIN_USER_CREATE]: 'Created admin user',
      [AdminAction.ADMIN_USER_UPDATE]: 'Updated admin user',
      [AdminAction.ADMIN_USER_DELETE]: 'Deleted admin user',
      [AdminAction.BULK_MESSAGE_SEND]: 'Sent bulk message',
      [AdminAction.EMAIL_CAMPAIGN_CREATE]: 'Created email campaign',
      [AdminAction.EMAIL_CAMPAIGN_SEND]: 'Sent email campaign',
      [AdminAction.NOTIFICATION_CONFIGURE]: 'Configured notifications',
      [AdminAction.NOTIFICATION_CONFIG_CREATE]: 'Created notification configuration',
      [AdminAction.NOTIFICATION_CONFIG_UPDATE]: 'Updated notification configuration',
      [AdminAction.NOTIFICATION_CONFIG_DELETE]: 'Deleted notification configuration',
      [AdminAction.EMAIL_TEMPLATE_CREATE]: 'Created email template',
      [AdminAction.EMAIL_TEMPLATE_UPDATE]: 'Updated email template',
      [AdminAction.EMAIL_TEMPLATE_DELETE]: 'Deleted email template',
      [AdminAction.EMAIL_TEMPLATE_TEST]: 'Sent test email from template',
      [AdminAction.BULK_OPERATION]: 'Performed bulk operation',
      [AdminAction.SYSTEM_CONFIGURATION]: 'Modified system configuration',
      [AdminAction.LOGIN]: 'Admin login',
      [AdminAction.LOGOUT]: 'Admin logout',
    };

    return actionDescriptions[action] || `${method} ${path}`;
  }

  /**
   * Extract error message from response data
   */
  private extractErrorMessage(responseData: any): string {
    if (!responseData) return 'Unknown error';

    try {
      const parsed = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
      return parsed.message || parsed.error?.message || 'Unknown error';
    } catch (error) {
      return String(responseData).substring(0, 500);
    }
  }

  /**
   * Determine if audit logging should be skipped for this request
   */
  private shouldSkipAudit(path: string, method: string): boolean {
    const skipPatterns = [
      '/api/admin/health',
      '/api/admin/status',
      '/api/admin/ping',
      '/api/admin/metrics',
    ];

    // Skip GET requests to certain endpoints to reduce noise
    if (method === 'GET') {
      const noisePatterns = [
        '/api/admin/assets',
        '/api/admin/static',
        '/api/admin/favicon',
      ];
      
      if (noisePatterns.some(pattern => path.startsWith(pattern))) {
        return true;
      }
    }

    return skipPatterns.some(pattern => path.startsWith(pattern));
  }
}
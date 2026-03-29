import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { RequireAdminRoles } from '../common/decorators/admin-roles.decorator';
import { AuditContext } from '../common/decorators/audit-context.decorator';
import { AdminRole } from '../schemas/admin-user.schema';
import { AdminAction } from '../schemas/audit-log.schema';
import { SecurityMonitoringService, SecurityAlert, SecurityAlertType, AlertSeverity } from '../common/services/security-monitoring.service';
import { AdminNotificationService } from '../common/services/admin-notification.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { SecurityAuditService } from './security-audit.service';
import { AuditTrailFiltersDto, ComplianceReportDto, AuditTrailExportDto } from './dto/audit-trail-filters.dto';

/**
 * DTO for security monitoring configuration
 */
export class SecurityConfigDto {
  maxFailedLogins?: number;
  failedLoginTimeWindow?: number;
  maxActionsPerHour?: number;
  maxBulkOperationsPerDay?: number;
  maxDataExportsPerDay?: number;
  businessHoursStart?: number;
  businessHoursEnd?: number;
  enableGeographicMonitoring?: boolean;
  allowedCountries?: string[];
  notifyOnCritical?: boolean;
  notifyOnHigh?: boolean;
  alertRecipients?: string[];
}

/**
 * DTO for resolving security alerts
 */
export class ResolveAlertDto {
  notes?: string;
}

/**
 * DTO for security alert filters
 */
export class SecurityAlertFiltersDto {
  severity?: AlertSeverity;
  type?: SecurityAlertType;
  resolved?: boolean;
  adminUserId?: string;
}

/**
 * Security audit controller for managing security monitoring and alerts
 */
@ApiTags('Admin Security & Audit')
@ApiBearerAuth()
@Controller('admin/security')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class SecurityAuditController {
  constructor(
    private readonly securityMonitoringService: SecurityMonitoringService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly auditLogService: AuditLogService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

  /**
   * Get security monitoring configuration
   */
  @Get('config')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.SYSTEM_CONFIGURATION,
    entityType: 'SecurityConfig',
    description: 'View security monitoring configuration',
  })
  @ApiOperation({ summary: 'Get security monitoring configuration' })
  @ApiResponse({ status: 200, description: 'Security configuration retrieved successfully' })
  getSecurityConfiguration() {
    try {
      const config = this.securityMonitoringService.getConfiguration();
      
      return {
        success: true,
        message: 'Security configuration retrieved successfully',
        data: config,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve security configuration',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update security monitoring configuration
   */
  @Put('config')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @AuditContext({
    action: AdminAction.SYSTEM_CONFIGURATION,
    entityType: 'SecurityConfig',
    description: 'Update security monitoring configuration',
  })
  @ApiOperation({ summary: 'Update security monitoring configuration' })
  @ApiResponse({ status: 200, description: 'Security configuration updated successfully' })
  updateSecurityConfiguration(@Body() configDto: SecurityConfigDto) {
    try {
      this.securityMonitoringService.updateConfiguration(configDto);
      
      return {
        success: true,
        message: 'Security configuration updated successfully',
        data: this.securityMonitoringService.getConfiguration(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to update security configuration',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get security alerts
   */
  @Get('alerts')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'SecurityAlert',
    description: 'View security alerts',
  })
  @ApiOperation({ summary: 'Get security alerts' })
  @ApiResponse({ status: 200, description: 'Security alerts retrieved successfully' })
  getSecurityAlerts(@Query() filters: SecurityAlertFiltersDto) {
    try {
      const alerts = this.securityMonitoringService.getAlerts(filters);
      
      return {
        success: true,
        message: 'Security alerts retrieved successfully',
        data: alerts,
        total: alerts.length,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve security alerts',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resolve security alert
   */
  @Put('alerts/:alertId/resolve')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.SYSTEM_CONFIGURATION,
    entityType: 'SecurityAlert',
    description: 'Resolve security alert',
  })
  @ApiOperation({ summary: 'Resolve security alert' })
  @ApiResponse({ status: 200, description: 'Security alert resolved successfully' })
  async resolveSecurityAlert(
    @Param('alertId') alertId: string,
    @Body() resolveDto: ResolveAlertDto,
  ) {
    try {
      // In a real implementation, you would get the admin user ID from the JWT token
      const adminUserId = 'current-admin-user-id'; // This should come from the authenticated user
      
      await this.securityMonitoringService.resolveAlert(
        alertId,
        adminUserId,
        resolveDto.notes,
      );
      
      return {
        success: true,
        message: 'Security alert resolved successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to resolve security alert',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get security statistics
   */
  @Get('statistics')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.ANALYTICS_VIEW,
    entityType: 'SecurityStatistics',
    description: 'View security statistics',
  })
  @ApiOperation({ summary: 'Get security statistics' })
  @ApiResponse({ status: 200, description: 'Security statistics retrieved successfully' })
  getSecurityStatistics() {
    try {
      const statistics = this.securityMonitoringService.getSecurityStatistics();
      
      return {
        success: true,
        message: 'Security statistics retrieved successfully',
        data: statistics,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve security statistics',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get audit trail
   */
  @Get('audit-trail')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'AuditLog',
    description: 'View audit trail',
  })
  @ApiOperation({ summary: 'Get audit trail' })
  @ApiResponse({ status: 200, description: 'Audit trail retrieved successfully' })
  async getAuditTrail(
    @Query('adminUserId') adminUserId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sortBy') sortBy: string = 'timestamp',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    try {
      const filters = {
        adminUserId,
        action: action as any,
        entityType,
        entityId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status,
        ipAddress,
      };

      const pagination = {
        page: Number(page),
        limit: Number(limit),
        sortBy,
        sortOrder,
      };

      const auditTrail = await this.auditLogService.getAuditTrail(filters, pagination);
      
      return {
        success: true,
        message: 'Audit trail retrieved successfully',
        data: auditTrail.data,
        pagination: {
          page: auditTrail.page,
          limit: auditTrail.limit,
          total: auditTrail.total,
          totalPages: auditTrail.totalPages,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve audit trail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Export audit trail
   */
  @Post('audit-trail/export')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_EXPORT,
    entityType: 'AuditLog',
    description: 'Export audit trail',
  })
  @ApiOperation({ summary: 'Export audit trail' })
  @ApiResponse({ status: 200, description: 'Audit trail exported successfully' })
  async exportAuditTrail(
    @Body() exportRequest: {
      format?: 'csv' | 'json';
      filters?: {
        adminUserId?: string;
        action?: string;
        entityType?: string;
        entityId?: string;
        startDate?: string;
        endDate?: string;
        status?: string;
        ipAddress?: string;
      };
    },
  ) {
    try {
      const { format = 'csv', filters = {} } = exportRequest;
      
      const auditFilters = {
        ...filters,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        action: filters.action as any,
      };

      const exportData = await this.auditLogService.exportAuditLog(auditFilters, format);
      
      return {
        success: true,
        message: 'Audit trail exported successfully',
        data: {
          format,
          content: exportData,
          exportedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to export audit trail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get notification statistics
   */
  @Get('notifications/statistics')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.ANALYTICS_VIEW,
    entityType: 'NotificationStatistics',
    description: 'View notification statistics',
  })
  @ApiOperation({ summary: 'Get notification statistics' })
  @ApiResponse({ status: 200, description: 'Notification statistics retrieved successfully' })
  getNotificationStatistics() {
    try {
      const statistics = this.adminNotificationService.getNotificationStatistics();
      
      return {
        success: true,
        message: 'Notification statistics retrieved successfully',
        data: statistics,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve notification statistics',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Send test security alert
   */
  @Post('alerts/test')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN)
  @AuditContext({
    action: AdminAction.SYSTEM_CONFIGURATION,
    entityType: 'SecurityAlert',
    description: 'Send test security alert',
  })
  @ApiOperation({ summary: 'Send test security alert' })
  @ApiResponse({ status: 200, description: 'Test alert sent successfully' })
  async sendTestAlert() {
    try {
      await this.adminNotificationService.sendSystemAlert(
        'Test Security Alert',
        'This is a test security alert to verify the notification system is working correctly.',
        AlertSeverity.LOW,
        {
          testAlert: true,
          timestamp: new Date().toISOString(),
        },
      );
      
      return {
        success: true,
        message: 'Test security alert sent successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to send test alert',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get comprehensive security audit report
   */
  @Get('audit/report')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'SecurityAuditReport',
    description: 'Generate security audit report',
  })
  @ApiOperation({ summary: 'Get comprehensive security audit report' })
  @ApiResponse({ status: 200, description: 'Security audit report generated successfully' })
  async getSecurityAuditReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const timeRange = startDate && endDate ? {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      } : undefined;

      const report = await this.securityAuditService.performSecurityAudit(timeRange);
      
      return {
        success: true,
        message: 'Security audit report generated successfully',
        data: report,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to generate security audit report',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get compliance report
   */
  @Get('compliance/report')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'ComplianceReport',
    description: 'Generate compliance report',
  })
  @ApiOperation({ summary: 'Get compliance report' })
  @ApiResponse({ status: 200, description: 'Compliance report generated successfully' })
  async getComplianceReport() {
    try {
      const report = await this.securityAuditService.getComplianceReport();
      
      return {
        success: true,
        message: 'Compliance report generated successfully',
        data: report,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to generate compliance report',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generate security incident report
   */
  @Get('incidents/:incidentId/report')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'IncidentReport',
    description: 'Generate security incident report',
  })
  @ApiOperation({ summary: 'Generate security incident report' })
  @ApiResponse({ status: 200, description: 'Incident report generated successfully' })
  async getIncidentReport(@Param('incidentId') incidentId: string) {
    try {
      const report = await this.securityAuditService.generateIncidentReport(incidentId);
      
      return {
        success: true,
        message: 'Incident report generated successfully',
        data: report,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to generate incident report',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Search audit trail with advanced filters
   */
  @Post('audit-trail/search')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_VIEW,
    entityType: 'AuditLog',
    description: 'Search audit trail',
  })
  @ApiOperation({ summary: 'Search audit trail with advanced filters' })
  @ApiResponse({ status: 200, description: 'Audit trail search completed successfully' })
  async searchAuditTrail(@Body() filtersDto: AuditTrailFiltersDto) {
    try {
      const filters = {
        adminUserId: filtersDto.adminUserId,
        action: filtersDto.action as AdminAction | undefined,
        entityType: filtersDto.entityType,
        entityId: filtersDto.entityId,
        startDate: filtersDto.startDate ? new Date(filtersDto.startDate) : undefined,
        endDate: filtersDto.endDate ? new Date(filtersDto.endDate) : undefined,
        status: filtersDto.status,
        ipAddress: filtersDto.ipAddress,
      };

      const pagination = {
        page: filtersDto.page || 1,
        limit: filtersDto.limit || 20,
        sortBy: filtersDto.sortBy || 'timestamp',
        sortOrder: filtersDto.sortOrder || 'desc',
      };

      const results = await this.auditLogService.getAuditTrail(filters, pagination);
      
      return {
        success: true,
        message: 'Audit trail search completed successfully',
        data: results.data,
        pagination: {
          page: results.page,
          limit: results.limit,
          total: results.total,
          totalPages: results.totalPages,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to search audit trail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Export audit trail with custom format
   */
  @Post('audit-trail/export/custom')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.AUDIT_LOG_EXPORT,
    entityType: 'AuditLog',
    description: 'Export audit trail with custom format',
  })
  @ApiOperation({ summary: 'Export audit trail with custom format' })
  @ApiResponse({ status: 200, description: 'Audit trail exported successfully' })
  async exportAuditTrailCustom(
    @Body() exportDto: AuditTrailExportDto,
    @Res() res: Response,
  ) {
    try {
      const filters = {
        adminUserId: exportDto.adminUserId,
        action: exportDto.action as AdminAction | undefined,
        entityType: exportDto.entityType,
        startDate: exportDto.startDate ? new Date(exportDto.startDate) : undefined,
        endDate: exportDto.endDate ? new Date(exportDto.endDate) : undefined,
      };

      const exportData = await this.auditLogService.exportAuditLog(
        filters,
        (exportDto.format === 'excel' ? 'csv' : exportDto.format) || 'csv',
      );

      // Set appropriate headers based on format
      const contentType = exportDto.format === 'json' 
        ? 'application/json' 
        : exportDto.format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';

      const filename = `audit-trail-${new Date().toISOString().split('T')[0]}.${exportDto.format || 'csv'}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to export audit trail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get audit statistics
   */
  @Get('audit/statistics')
  @RequireAdminRoles(AdminRole.SUPER_ADMIN, AdminRole.SECURITY_AUDITOR)
  @AuditContext({
    action: AdminAction.ANALYTICS_VIEW,
    entityType: 'AuditStatistics',
    description: 'View audit statistics',
  })
  @ApiOperation({ summary: 'Get audit statistics' })
  @ApiResponse({ status: 200, description: 'Audit statistics retrieved successfully' })
  async getAuditStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const filters = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      };

      const statistics = await this.auditLogService.getAuditStatistics(filters);
      
      return {
        success: true,
        message: 'Audit statistics retrieved successfully',
        data: statistics,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve audit statistics',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

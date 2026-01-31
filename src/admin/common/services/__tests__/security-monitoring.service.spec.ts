import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SecurityMonitoringService, SecurityAlertType, AlertSeverity } from '../security-monitoring.service';
import { AdminNotificationService } from '../admin-notification.service';
import { AuditLog, AdminAction } from '../../../schemas/audit-log.schema';

describe('SecurityMonitoringService', () => {
  let service: SecurityMonitoringService;
  let auditLogModel: Model<AuditLog>;
  let adminNotificationService: AdminNotificationService;

  const mockAuditLogModel = {
    countDocuments: jest.fn(),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue([]), // Return empty array by default
    }),
    aggregate: jest.fn(),
  };

  const mockAdminNotificationService = {
    sendSecurityAlert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityMonitoringService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockAuditLogModel,
        },
        {
          provide: AdminNotificationService,
          useValue: mockAdminNotificationService,
        },
      ],
    }).compile();

    service = module.get<SecurityMonitoringService>(SecurityMonitoringService);
    auditLogModel = module.get<Model<AuditLog>>(getModelToken(AuditLog.name));
    adminNotificationService = module.get<AdminNotificationService>(AdminNotificationService);

    // Clear any existing alerts and reset state
    (service as any).alerts.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear alerts after each test to prevent interference
    (service as any).alerts.clear();
    // Clear any timers that might be running
    jest.clearAllTimers();
  });

  describe('updateConfiguration', () => {
    it('should update security monitoring configuration', () => {
      const newConfig = {
        maxFailedLogins: 10,
        maxActionsPerHour: 200,
      };

      service.updateConfiguration(newConfig);
      const config = service.getConfiguration();

      expect(config.maxFailedLogins).toBe(10);
      expect(config.maxActionsPerHour).toBe(200);
    });
  });

  describe('monitorAction', () => {
    it('should monitor failed login attempts', async () => {
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.LOGIN,
        entityType: 'Admin',
        entityId: new Types.ObjectId(),
        status: 'failed',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock 6 failed attempts (exceeding default threshold of 5)
      mockAuditLogModel.countDocuments.mockResolvedValue(6);

      await service.monitorAction(auditLog);

      expect(mockAuditLogModel.countDocuments).toHaveBeenCalledWith({
        adminUserId: auditLog.adminUserId,
        action: AdminAction.LOGIN,
        status: 'failed',
        timestamp: { $gte: expect.any(Date) },
      });

      // Should create an alert for multiple failed attempts
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(SecurityAlertType.MULTIPLE_FAILED_ATTEMPTS);
      expect(alerts[0].severity).toBe(AlertSeverity.HIGH);
    });

    it('should monitor bulk operation abuse', async () => {
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.BULK_OPERATION,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock 11 bulk operations today (exceeding default threshold of 10)
      mockAuditLogModel.countDocuments.mockResolvedValue(11);

      await service.monitorAction(auditLog);

      expect(mockAuditLogModel.countDocuments).toHaveBeenCalledWith({
        adminUserId: auditLog.adminUserId,
        action: AdminAction.BULK_OPERATION,
        timestamp: { $gte: expect.any(Date) },
      });

      // Should create an alert for bulk operation abuse
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(SecurityAlertType.BULK_OPERATION_ABUSE);
      expect(alerts[0].severity).toBe(AlertSeverity.HIGH);
    });

    it('should monitor data export abuse', async () => {
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.DATA_EXPORT,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock 6 data exports today (exceeding default threshold of 5)
      // First call for data export abuse check, second call for sensitive actions check
      mockAuditLogModel.countDocuments
        .mockResolvedValueOnce(6) // Data export abuse check
        .mockResolvedValueOnce(6); // Sensitive actions check

      await service.monitorAction(auditLog);

      expect(mockAuditLogModel.countDocuments).toHaveBeenCalledWith({
        adminUserId: auditLog.adminUserId,
        action: { $in: [AdminAction.DATA_EXPORT, AdminAction.AUDIT_LOG_EXPORT] },
        timestamp: { $gte: expect.any(Date) },
      });

      // Should create a critical alert for data export abuse
      const alerts = service.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      
      // Check that data export abuse alert was created
      const dataExportAlert = alerts.find(alert => alert.type === SecurityAlertType.DATA_EXPORT_ABUSE);
      expect(dataExportAlert).toBeDefined();
      expect(dataExportAlert!.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should monitor high volume actions', async () => {
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.USER_VIEW_DETAILS,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock 101 actions in the last hour (exceeding default threshold of 100)
      mockAuditLogModel.countDocuments.mockResolvedValue(101);

      await service.monitorAction(auditLog);

      expect(mockAuditLogModel.countDocuments).toHaveBeenCalledWith({
        adminUserId: auditLog.adminUserId,
        timestamp: { $gte: expect.any(Date) },
      });

      // Should create an alert for high volume actions
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(SecurityAlertType.HIGH_VOLUME_ACTIONS);
      expect(alerts[0].severity).toBe(AlertSeverity.MEDIUM);
    });

    it('should not create alerts for normal activity', async () => {
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.USER_VIEW_DETAILS,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock normal activity levels
      mockAuditLogModel.countDocuments.mockResolvedValue(5);

      await service.monitorAction(auditLog);

      // Should not create any alerts
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getAlerts', () => {
    it('should return filtered alerts', async () => {
      // Create some test alerts
      const auditLog1 = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.LOGIN,
        entityType: 'Admin',
        entityId: new Types.ObjectId(),
        status: 'failed',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      const auditLog2 = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.DATA_EXPORT,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      // Mock conditions to create alerts
      // For auditLog1 (failed login): 6 failed attempts
      // For auditLog2 (data export): 6 exports and 6 sensitive actions
      mockAuditLogModel.countDocuments
        .mockResolvedValueOnce(6) // Failed logins for auditLog1
        .mockResolvedValueOnce(6) // Data exports for auditLog2
        .mockResolvedValueOnce(6); // Sensitive actions for auditLog2

      await service.monitorAction(auditLog1);
      await service.monitorAction(auditLog2);

      // Get all alerts
      const allAlerts = service.getAlerts();
      expect(allAlerts.length).toBeGreaterThanOrEqual(2);

      // Get filtered alerts
      const criticalAlerts = service.getAlerts({ severity: AlertSeverity.CRITICAL });
      expect(criticalAlerts.length).toBeGreaterThanOrEqual(1);
      
      const dataExportAlert = criticalAlerts.find(alert => alert.type === SecurityAlertType.DATA_EXPORT_ABUSE);
      expect(dataExportAlert).toBeDefined();

      const highAlerts = service.getAlerts({ severity: AlertSeverity.HIGH });
      expect(highAlerts.length).toBeGreaterThanOrEqual(1);
      
      const failedLoginAlert = highAlerts.find(alert => alert.type === SecurityAlertType.MULTIPLE_FAILED_ATTEMPTS);
      expect(failedLoginAlert).toBeDefined();
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert', async () => {
      // Create a test alert first
      const auditLog = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.LOGIN,
        entityType: 'Admin',
        entityId: new Types.ObjectId(),
        status: 'failed',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      mockAuditLogModel.countDocuments.mockResolvedValue(6);
      await service.monitorAction(auditLog);

      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].resolved).toBe(false);

      // Resolve the alert
      const resolvedBy = new Types.ObjectId().toString();
      const notes = 'False positive - legitimate admin activity';
      
      await service.resolveAlert(alerts[0].id!, resolvedBy, notes);

      // Check that alert is resolved
      const resolvedAlerts = service.getAlerts();
      expect(resolvedAlerts[0].resolved).toBe(true);
      expect(resolvedAlerts[0].resolvedBy?.toString()).toBe(resolvedBy);
      expect(resolvedAlerts[0].resolutionNotes).toBe(notes);
      expect(resolvedAlerts[0].resolvedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent alert', async () => {
      const nonExistentId = new Types.ObjectId().toString();
      const resolvedBy = new Types.ObjectId().toString();

      await expect(
        service.resolveAlert(nonExistentId, resolvedBy)
      ).rejects.toThrow('Alert not found');
    });
  });

  describe('getSecurityStatistics', () => {
    it('should return security statistics', async () => {
      // Create some test alerts
      const auditLog1 = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.LOGIN,
        entityType: 'Admin',
        entityId: new Types.ObjectId(),
        status: 'failed',
        timestamp: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      const auditLog2 = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.DATA_EXPORT,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        status: 'success',
        timestamp: new Date(),
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
      } as AuditLog;

      mockAuditLogModel.countDocuments
        .mockResolvedValueOnce(6) // Failed logins for auditLog1
        .mockResolvedValueOnce(6) // Data exports for auditLog2
        .mockResolvedValueOnce(6); // Sensitive actions for auditLog2

      await service.monitorAction(auditLog1);
      await service.monitorAction(auditLog2);

      const stats = service.getSecurityStatistics();

      expect(stats.totalAlerts).toBeGreaterThanOrEqual(2);
      expect(stats.unresolvedAlerts).toBeGreaterThanOrEqual(2);
      expect(stats.alertsBySeverity[AlertSeverity.HIGH]).toBeGreaterThanOrEqual(1);
      expect(stats.alertsBySeverity[AlertSeverity.CRITICAL]).toBeGreaterThanOrEqual(1);
      expect(stats.alertsByType[SecurityAlertType.MULTIPLE_FAILED_ATTEMPTS]).toBeGreaterThanOrEqual(1);
      expect(stats.alertsByType[SecurityAlertType.DATA_EXPORT_ABUSE]).toBeGreaterThanOrEqual(1);
    });
  });
});
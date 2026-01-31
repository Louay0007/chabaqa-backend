import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService, AuditLogEntry } from '../audit-log.service';
import { AuditLog, AdminAction } from '../../../schemas/audit-log.schema';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let auditLogModel: Model<AuditLog>;

  const mockAuditLogModel = {
    constructor: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    populate: jest.fn(),
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    exec: jest.fn(),
    aggregate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockAuditLogModel,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    auditLogModel = module.get<Model<AuditLog>>(getModelToken(AuditLog.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should create and save an audit log entry', async () => {
      const auditEntry: AuditLogEntry = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.USER_SUSPEND,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        description: 'Test audit log entry',
      };

      const mockSavedLog = {
        ...auditEntry,
        _id: new Types.ObjectId(),
        timestamp: new Date(),
      };

      // Mock the model constructor and save method
      const mockInstance = {
        save: jest.fn().mockResolvedValue(mockSavedLog),
      };
      
      // Mock the model constructor to return our mock instance
      (auditLogModel as any) = jest.fn().mockImplementation(() => mockInstance);
      
      // Update service to use the mocked model
      (service as any).auditLogModel = auditLogModel;

      const result = await service.logAction(auditEntry);

      expect(auditLogModel).toHaveBeenCalledWith({
        ...auditEntry,
        timestamp: expect.any(Date),
      });
      expect(mockInstance.save).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const auditEntry: AuditLogEntry = {
        adminUserId: new Types.ObjectId(),
        action: AdminAction.USER_SUSPEND,
        entityType: 'User',
        entityId: new Types.ObjectId(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const mockInstance = {
        save: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      
      (auditLogModel as any) = jest.fn().mockImplementation(() => mockInstance);
      (service as any).auditLogModel = auditLogModel;

      await expect(service.logAction(auditEntry)).rejects.toThrow('Database error');
    });
  });

  describe('getAuditTrail', () => {
    it('should return paginated audit trail', async () => {
      const mockLogs = [
        {
          _id: new Types.ObjectId(),
          adminUserId: new Types.ObjectId(),
          action: AdminAction.USER_SUSPEND,
          entityType: 'User',
          entityId: new Types.ObjectId(),
          timestamp: new Date(),
        },
      ];

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockLogs),
      };

      mockAuditLogModel.find.mockReturnValue(mockQuery);
      mockAuditLogModel.countDocuments.mockResolvedValue(1);

      const result = await service.getAuditTrail({}, { page: 1, limit: 20 });

      expect(result).toEqual({
        data: mockLogs,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      expect(mockAuditLogModel.find).toHaveBeenCalled();
      expect(mockQuery.populate).toHaveBeenCalledWith('adminUser', 'userId roles');
      expect(mockQuery.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
    });

    it('should apply filters correctly', async () => {
      const filters = {
        adminUserId: new Types.ObjectId().toString(),
        action: AdminAction.USER_SUSPEND,
        entityType: 'User',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      };

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };

      mockAuditLogModel.find.mockReturnValue(mockQuery);
      mockAuditLogModel.countDocuments.mockResolvedValue(0);

      await service.getAuditTrail(filters, { page: 1, limit: 20 });

      expect(mockAuditLogModel.find).toHaveBeenCalledWith({
        adminUserId: new Types.ObjectId(filters.adminUserId),
        action: filters.action,
        entityType: filters.entityType,
        timestamp: {
          $gte: filters.startDate,
          $lte: filters.endDate,
        },
      });
    });
  });

  describe('exportAuditLog', () => {
    it('should export audit logs in CSV format', async () => {
      const mockLogs = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          adminUserId: new Types.ObjectId(),
          action: AdminAction.USER_SUSPEND,
          entityType: 'User',
          entityId: new Types.ObjectId(),
          status: 'success',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          description: 'Test action',
        },
      ];

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockLogs),
      };

      mockAuditLogModel.find.mockReturnValue(mockQuery);

      const result = await service.exportAuditLog({}, 'csv');

      expect(result).toContain('Timestamp,Admin User ID,Action,Entity Type');
      expect(result).toContain('2024-01-01T10:00:00.000Z');
      expect(result).toContain(AdminAction.USER_SUSPEND);
      expect(result).toContain('User');
    });

    it('should export audit logs in JSON format', async () => {
      const mockLogs = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          adminUserId: new Types.ObjectId(),
          action: AdminAction.USER_SUSPEND,
          entityType: 'User',
          entityId: new Types.ObjectId(),
        },
      ];

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockLogs),
      };

      mockAuditLogModel.find.mockReturnValue(mockQuery);

      const result = await service.exportAuditLog({}, 'json');

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe(AdminAction.USER_SUSPEND);
    });
  });

  describe('getAuditStatistics', () => {
    it('should return audit statistics', async () => {
      mockAuditLogModel.countDocuments.mockResolvedValue(100);
      mockAuditLogModel.aggregate.mockResolvedValue([
        { _id: AdminAction.USER_SUSPEND, count: 10 },
        { _id: AdminAction.USER_ACTIVATE, count: 5 },
      ]);

      const result = await service.getAuditStatistics();

      expect(result.totalActions).toBe(100);
      expect(result.actionsByType).toHaveLength(2);
      expect(mockAuditLogModel.countDocuments).toHaveBeenCalled();
      expect(mockAuditLogModel.aggregate).toHaveBeenCalled();
    });
  });
});
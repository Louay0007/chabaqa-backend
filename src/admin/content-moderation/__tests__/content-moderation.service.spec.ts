import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ContentModerationService } from '../content-moderation.service';
import { ContentModerationQueue } from '../../schemas/content-moderation-queue.schema';
import { AuditLogService } from '../../common/services/audit-log.service';
import { AdminNotificationService } from '../../common/services/admin-notification.service';

describe('ContentModerationService', () => {
  let service: ContentModerationService;
  let mockModel: any;
  let mockAuditLogService: any;
  let mockAdminNotificationService: any;

  beforeEach(async () => {
    mockModel = {
      find: jest.fn().mockReturnThis(),
      findById: jest.fn().mockReturnThis(),
      findByIdAndUpdate: jest.fn().mockReturnThis(),
      countDocuments: jest.fn().mockReturnThis(),
      aggregate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    mockAdminNotificationService = {
      sendSystemAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentModerationService,
        {
          provide: getModelToken(ContentModerationQueue.name),
          useValue: mockModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: AdminNotificationService,
          useValue: mockAdminNotificationService,
        },
      ],
    }).compile();

    service = module.get<ContentModerationService>(ContentModerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getModerationStats', () => {
    it('should return moderation statistics', async () => {
      // Setup mocks for the complex method calls
      const mockCountDocuments = jest.fn();
      const mockAggregate = jest.fn();
      
      // Mock countDocuments calls
      mockCountDocuments
        .mockResolvedValueOnce(100) // totalItems
        .mockResolvedValueOnce(5)   // urgentItems
        .mockResolvedValueOnce(3)   // overdueItems
        .mockResolvedValueOnce(10)  // reportedItems
        .mockResolvedValueOnce(15)  // manualReviewItems
        .mockResolvedValueOnce(25)  // todayProcessed
        .mockResolvedValueOnce(75); // weekProcessed

      // Mock aggregate calls
      mockAggregate
        .mockResolvedValueOnce([
          { _id: 'pending', count: 50 },
          { _id: 'approved', count: 30 },
          { _id: 'rejected', count: 20 }
        ]) // statusCounts
        .mockResolvedValueOnce([
          { _id: 'post', count: 60 },
          { _id: 'course', count: 40 }
        ]) // typeCounts
        .mockResolvedValueOnce([
          { _id: 'normal', count: 80 },
          { _id: 'high', count: 20 }
        ]) // priorityCounts
        .mockResolvedValueOnce([{ avgProcessingTime: 12.5 }]); // avgProcessingTime

      // Override the model methods for this test
      mockModel.countDocuments = jest.fn().mockImplementation(() => ({
        exec: mockCountDocuments
      }));
      mockModel.aggregate = jest.fn().mockImplementation(() => ({
        exec: mockAggregate
      }));

      const stats = await service.getModerationStats();

      expect(stats).toBeDefined();
      expect(stats.totalItems).toBe(100);
      expect(stats.urgentItems).toBe(5);
      expect(stats.overdueItems).toBe(3);
      expect(stats.reportedItems).toBe(10);
      expect(stats.manualReviewItems).toBe(15);
      expect(stats.todayProcessed).toBe(25);
      expect(stats.weekProcessed).toBe(75);
    });
  });

  describe('getModerationQueue', () => {
    it('should return paginated moderation queue', async () => {
      const mockItems = [
        {
          _id: '507f1f77bcf86cd799439011',
          contentId: '507f1f77bcf86cd799439012',
          contentType: 'post',
          status: 'pending',
          priority: 'normal',
          submittedAt: new Date(),
          creator: { _id: '507f1f77bcf86cd799439013', name: 'Test User', email: 'test@example.com' },
          tags: [],
          reportCount: 0,
          requiresManualReview: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Mock the chained query methods
      const mockExec = jest.fn()
        .mockResolvedValueOnce(mockItems) // for find query
        .mockResolvedValueOnce(1);        // for countDocuments query

      mockModel.countDocuments = jest.fn().mockImplementation(() => ({
        exec: () => Promise.resolve(1)
      }));

      mockModel.exec = mockExec;

      const filters = { page: 1, limit: 20 };
      const adminContext = {
        adminUserId: '507f1f77bcf86cd799439014' as any,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        action: 'CONTENT_MODERATION_QUEUE_VIEW' as any,
        entityType: 'ContentModerationQueue',
        entityId: '507f1f77bcf86cd799439015' as any
      };

      const result = await service.getModerationQueue(filters, adminContext);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });
  });
});
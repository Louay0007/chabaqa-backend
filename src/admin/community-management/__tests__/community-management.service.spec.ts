import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CommunityManagementService } from '../community-management.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { Community } from '../../../schema/community.schema';
import { User } from '../../../schema/user.schema';

describe('CommunityManagementService', () => {
  let service: CommunityManagementService;
  let mockCommunityModel: any;
  let mockUserModel: any;
  let mockAuditLogService: any;
  let testAdminId: string;
  let testCommunityId: string;

  beforeEach(async () => {
    // Generate valid ObjectIds for testing
    testAdminId = new Types.ObjectId().toString();
    testCommunityId = new Types.ObjectId().toString();

    // Mock models
    mockCommunityModel = {
      find: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    mockUserModel = {
      findById: jest.fn(),
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityManagementService,
        {
          provide: getModelToken(Community.name),
          useValue: mockCommunityModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<CommunityManagementService>(CommunityManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCommunities', () => {
    it('should return paginated communities', async () => {
      const mockCommunities = [
        {
          _id: testCommunityId,
          name: 'Test Community',
          slug: 'test-community',
          short_description: 'A test community',
          category: 'Technology',
          logo: 'logo.png',
          photo_de_couverture: 'cover.png',
          createur: {
            _id: new Types.ObjectId().toString(),
            name: 'Test User',
            email: 'test@example.com',
          },
          membersCount: 10,
          isActive: true,
          isPrivate: false,
          isVerified: false,
          featured: false,
          priceType: 'free',
          price: 0,
          fees_of_join: 0,
          currency: 'USD',
          rating: 0,
          tags: ['test'],
          stats: {
            totalRevenue: 0,
            monthlyGrowth: 0,
            engagementRate: 0,
            retentionRate: 0,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCommunityModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCommunities),
      });

      mockCommunityModel.countDocuments.mockResolvedValue(1);

      const filters = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      };

      const result = await service.getCommunities(
        filters,
        testAdminId,
        '127.0.0.1',
        'test-agent'
      );

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });
  });

  describe('calculateCommunityAnalytics', () => {
    it('should calculate analytics for a community', async () => {
      const mockCommunity = {
        _id: testCommunityId,
        name: 'Test Community',
        slug: 'test-community',
        category: 'Technology',
        membersCount: 100,
        fees_of_join: 10,
        priceType: 'one-time',
        createdAt: new Date(),
      };

      mockCommunityModel.findById.mockResolvedValue(mockCommunity);

      const result = await service.getCommunityAnalytics(
        testCommunityId,
        'last_30_days' as any,
        testAdminId,
        '127.0.0.1',
        'test-agent'
      );

      // Since this is a mock calculation, we just verify the method doesn't throw
      expect(result).toBeDefined();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });
  });
});
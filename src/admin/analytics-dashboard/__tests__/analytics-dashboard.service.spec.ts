import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AnalyticsDashboardService } from '../analytics-dashboard.service';
import { AnalyticsService } from '../../common/services/analytics.service';
import { ExportService } from '../../common/services/export.service';
import { AdminNotificationService } from '../../common/services/admin-notification.service';
import { AlertMetricType, AlertCondition, AlertSeverity } from '../dto/alert-config.dto';
import { AdminAlertConfig } from '../schemas/admin-alert-config.schema';

describe('AnalyticsDashboardService', () => {
  let service: AnalyticsDashboardService;
  let analyticsService: AnalyticsService;
  let exportService: ExportService;
  let adminNotificationService: AdminNotificationService;
  let alertModel: {
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  const createdAt = new Date('2024-01-01T00:00:00.000Z');
  const baseAlertDoc = {
    _id: new Types.ObjectId(),
    name: 'High Error Rate',
    description: 'Triggers when error rate exceeds 5%',
    metricType: AlertMetricType.ERROR_RATE,
    condition: AlertCondition.GREATER_THAN,
    threshold: 5,
    severity: AlertSeverity.CRITICAL,
    isEnabled: true,
    notifyAdmins: [],
    notifyEmails: ['admin@example.com'],
    triggerCount: 3,
    lastTriggered: createdAt,
    createdBy: new Types.ObjectId(),
    createdAt,
    updatedAt: createdAt,
  };

  beforeEach(async () => {
    alertModel = {
      create: jest.fn().mockImplementation(async (payload) => ({
        ...baseAlertDoc,
        ...payload,
        _id: new Types.ObjectId(),
      })),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([baseAlertDoc]),
        }),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(baseAlertDoc),
      }),
      findByIdAndDelete: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(baseAlertDoc),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(baseAlertDoc),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsDashboardService,
        {
          provide: AnalyticsService,
          useValue: {
            calculateUserGrowth: jest.fn(),
            getEngagementMetrics: jest.fn(),
            getRevenueAnalytics: jest.fn(),
            getPlatformHealth: jest.fn(),
            getDashboardMetrics: jest.fn(),
            getPlatformContentMetrics: jest.fn().mockResolvedValue({ totalContent: 0 }),
            getRetentionMetrics: jest.fn().mockResolvedValue({
              overview: {
                dayOneRetention: 0,
                daySevenRetention: 0,
                dayThirtyRetention: 0,
                churnRate: 0,
                averageLifetimeDays: 0,
              },
              cohorts: [],
              trends: [],
              period: {
                startDate: new Date(),
                endDate: new Date(),
              },
            }),
          }
        },
        {
          provide: ExportService,
          useValue: {
            createExportJob: jest.fn(),
            processExportJob: jest.fn()
          }
        },
        {
          provide: AdminNotificationService,
          useValue: {
            sendNotification: jest.fn(),
            sendSystemAlert: jest.fn(),
          }
        },
        {
          provide: getModelToken(AdminAlertConfig.name),
          useValue: alertModel,
        }
      ]
    }).compile();

    service = module.get<AnalyticsDashboardService>(AnalyticsDashboardService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    exportService = module.get<ExportService>(ExportService);
    adminNotificationService = module.get<AdminNotificationService>(AdminNotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardData', () => {
    it('should return comprehensive dashboard data', async () => {
      const period = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        granularity: 'month' as const
      };

      const mockUserGrowth = {
        totalUsers: 1000,
        totalCommunities: 125,
        newUsers: 100,
        activeUsers: 500,
        retainedUsers: 400,
        churnedUsers: 50,
        growthRate: 10,
        period
      };

      const mockEngagement = {
        totalSessions: 5000,
        averageSessionDuration: 600,
        pageViews: 15000,
        bounceRate: 0.4,
        contentInteractions: 2000,
        communityParticipation: 500,
        period
      };

      const mockRevenue = {
        totalRevenue: 50000,
        subscriptionRevenue: 40000,
        oneTimeRevenue: 10000,
        averageRevenuePerUser: 50,
        monthlyRecurringRevenue: 35000,
        churnRate: 0.05,
        lifetimeValue: 1000,
        period
      };

      const mockHealth = {
        systemUptime: 99.9,
        averageResponseTime: 100,
        errorRate: 0.01,
        activeConnections: 200,
        databasePerformance: {
          connectionCount: 20,
          queryPerformance: 50,
          storageUsed: 2000,
          indexEfficiency: 0.95
        },
        serverResources: {
          cpuUsage: 0.5,
          memoryUsage: 0.6,
          diskUsage: 0.3,
          networkTraffic: 500
        },
        lastUpdated: new Date()
      };

      jest.spyOn(analyticsService, 'calculateUserGrowth').mockResolvedValue(mockUserGrowth);
      jest.spyOn(analyticsService, 'getEngagementMetrics').mockResolvedValue(mockEngagement);
      jest.spyOn(analyticsService, 'getRevenueAnalytics').mockResolvedValue(mockRevenue);
      jest.spyOn(analyticsService, 'getPlatformHealth').mockResolvedValue(mockHealth);

      const result = await service.getDashboardData(period);

      expect(result).toBeDefined();
      expect(result.platformStatistics).toBeDefined();
      expect(result.engagementMetrics).toBeDefined();
      expect(result.retentionAnalysis).toBeDefined();
      expect(result.revenueMetrics).toBeDefined();
      expect(result.healthMetrics).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('calculatePlatformStatistics', () => {
    it('should calculate platform statistics correctly', async () => {
      const period = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        granularity: 'month' as const
      };

      const mockUserGrowth = {
        totalUsers: 1000,
        totalCommunities: 125,
        newUsers: 100,
        activeUsers: 500,
        retainedUsers: 400,
        churnedUsers: 50,
        growthRate: 10,
        period
      };

      const mockRevenue = {
        totalRevenue: 50000,
        subscriptionRevenue: 40000,
        oneTimeRevenue: 10000,
        averageRevenuePerUser: 50,
        monthlyRecurringRevenue: 35000,
        churnRate: 0.05,
        lifetimeValue: 1000,
        period
      };

      const mockHealth = {
        systemUptime: 99.9,
        averageResponseTime: 100,
        errorRate: 0.01,
        activeConnections: 200,
        databasePerformance: {
          connectionCount: 20,
          queryPerformance: 50,
          storageUsed: 2000,
          indexEfficiency: 0.95
        },
        serverResources: {
          cpuUsage: 0.5,
          memoryUsage: 0.6,
          diskUsage: 0.3,
          networkTraffic: 500
        },
        lastUpdated: new Date()
      };

      jest.spyOn(analyticsService, 'calculateUserGrowth').mockResolvedValue(mockUserGrowth);
      jest.spyOn(analyticsService, 'getRevenueAnalytics').mockResolvedValue(mockRevenue);
      jest.spyOn(analyticsService, 'getPlatformHealth').mockResolvedValue(mockHealth);

      const result = await service.calculatePlatformStatistics(period);

      expect(result.totalUsers).toBe(1000);
      expect(result.activeUsers).toBe(500);
      expect(result.newUsers).toBe(100);
      expect(result.growthRate).toBe(10);
      expect(result.totalRevenue).toBe(50000);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('createAlert', () => {
    it('should create alert configuration', async () => {
      const createAlertDto = {
        name: 'High Error Rate',
        description: 'Triggers when error rate exceeds 5%',
        metricType: AlertMetricType.ERROR_RATE,
        condition: AlertCondition.GREATER_THAN,
        threshold: 5,
        severity: AlertSeverity.CRITICAL,
        notifyAdmins: ['admin-id'],
        notifyEmails: ['admin@example.com']
      };

      const result = await service.createAlert(createAlertDto, 'admin-id');

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(createAlertDto.name);
      expect(result.metricType).toBe(createAlertDto.metricType);
      expect(result.threshold).toBe(createAlertDto.threshold);
      expect(result.isEnabled).toBe(true);
      expect(typeof result.createdBy).toBe('string');
      expect(result.createdBy.length).toBeGreaterThan(0);
    });
  });

  describe('exportAnalyticsData', () => {
    it('should create export job for analytics data', async () => {
      const period = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        granularity: 'month' as const
      };

      const mockUserGrowth = {
        totalUsers: 1000,
        totalCommunities: 125,
        newUsers: 100,
        activeUsers: 500,
        retainedUsers: 400,
        churnedUsers: 50,
        growthRate: 10,
        period
      };

      const mockEngagement = {
        totalSessions: 5000,
        averageSessionDuration: 600,
        pageViews: 15000,
        bounceRate: 0.4,
        contentInteractions: 2000,
        communityParticipation: 500,
        period
      };

      const mockRevenue = {
        totalRevenue: 50000,
        subscriptionRevenue: 40000,
        oneTimeRevenue: 10000,
        averageRevenuePerUser: 50,
        monthlyRecurringRevenue: 35000,
        churnRate: 0.05,
        lifetimeValue: 1000,
        period
      };

      const mockHealth = {
        systemUptime: 99.9,
        averageResponseTime: 100,
        errorRate: 0.01,
        activeConnections: 200,
        databasePerformance: {
          connectionCount: 20,
          queryPerformance: 50,
          storageUsed: 2000,
          indexEfficiency: 0.95
        },
        serverResources: {
          cpuUsage: 0.5,
          memoryUsage: 0.6,
          diskUsage: 0.3,
          networkTraffic: 500
        },
        lastUpdated: new Date()
      };

      const mockExportJob = {
        id: 'job-123',
        type: 'analytics',
        status: 'pending',
        downloadUrl: 'https://example.com/download/job-123',
        createdAt: new Date()
      };

      jest.spyOn(analyticsService, 'calculateUserGrowth').mockResolvedValue(mockUserGrowth);
      jest.spyOn(analyticsService, 'getEngagementMetrics').mockResolvedValue(mockEngagement);
      jest.spyOn(analyticsService, 'getRevenueAnalytics').mockResolvedValue(mockRevenue);
      jest.spyOn(analyticsService, 'getPlatformHealth').mockResolvedValue(mockHealth);
      jest.spyOn(exportService, 'createExportJob').mockResolvedValue(mockExportJob as any);

      const result = await service.exportAnalyticsData(period, 'csv');

      expect(result).toBeDefined();
      expect(result.jobId).toBe('job-123');
      expect(result.downloadUrl).toBeDefined();
      expect(exportService.createExportJob).toHaveBeenCalled();
    });
  });

  describe('getAlerts', () => {
    it('should return list of alerts', async () => {
      const result = await service.getAlerts();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('checkAlerts', () => {
    it('should check alerts and return triggered notifications', async () => {
      const mockHealth = {
        systemUptime: 99.9,
        averageResponseTime: 100,
        errorRate: 0.06, // Above threshold
        activeConnections: 200,
        databasePerformance: {
          connectionCount: 20,
          queryPerformance: 50,
          storageUsed: 2000,
          indexEfficiency: 0.95
        },
        serverResources: {
          cpuUsage: 0.5,
          memoryUsage: 0.6,
          diskUsage: 0.3,
          networkTraffic: 500
        },
        lastUpdated: new Date()
      };

      const mockUserGrowth = {
        totalUsers: 1000,
        totalCommunities: 125,
        newUsers: 100,
        activeUsers: 500,
        retainedUsers: 400,
        churnedUsers: 50,
        growthRate: 10,
        period: {
          startDate: new Date(),
          endDate: new Date()
        }
      };

      jest.spyOn(analyticsService, 'getPlatformHealth').mockResolvedValue(mockHealth);
      jest.spyOn(analyticsService, 'calculateUserGrowth').mockResolvedValue(mockUserGrowth);

      const result = await service.checkAlerts();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

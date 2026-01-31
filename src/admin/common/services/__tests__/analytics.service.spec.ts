import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService, TimePeriod, EngagementFilters } from '../analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateUserGrowth', () => {
    it('should return user growth metrics for given period', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day'
      };

      const metrics = await service.calculateUserGrowth(period);

      expect(metrics).toBeDefined();
      expect(metrics.totalUsers).toBeGreaterThan(0);
      expect(metrics.newUsers).toBeGreaterThan(0);
      expect(metrics.activeUsers).toBeGreaterThan(0);
      expect(metrics.retainedUsers).toBeGreaterThan(0);
      expect(metrics.churnedUsers).toBeGreaterThan(0);
      expect(typeof metrics.growthRate).toBe('number');
      expect(metrics.period).toEqual(period);
      expect(Array.isArray(metrics.dailyBreakdown)).toBe(true);
    });

    it('should generate daily breakdown for the period', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'), // 7 days
        granularity: 'day'
      };

      const metrics = await service.calculateUserGrowth(period);

      expect(metrics.dailyBreakdown?.length).toBeGreaterThanOrEqual(6);
      expect(metrics.dailyBreakdown?.length).toBeLessThanOrEqual(7);
      metrics.dailyBreakdown?.forEach(daily => {
        expect(daily.date).toBeInstanceOf(Date);
        expect(typeof daily.value).toBe('number');
        expect(typeof daily.change).toBe('number');
      });
    });

    it('should handle different time periods correctly', async () => {
      const shortPeriod: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-02'),
        granularity: 'day'
      };

      const longPeriod: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-01'),
        granularity: 'month'
      };

      const shortMetrics = await service.calculateUserGrowth(shortPeriod);
      const longMetrics = await service.calculateUserGrowth(longPeriod);

      expect(shortMetrics.dailyBreakdown?.length).toBeGreaterThanOrEqual(1);
      expect(shortMetrics.dailyBreakdown?.length).toBeLessThanOrEqual(2);
      expect(longMetrics.dailyBreakdown?.length).toBeGreaterThanOrEqual(50); // Approximately 60 days
    });

    it('should calculate growth rate correctly', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day'
      };

      const metrics = await service.calculateUserGrowth(period);

      expect(metrics.growthRate).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(metrics.growthRate)).toBe(true);
    });
  });

  describe('getEngagementMetrics', () => {
    it('should return engagement metrics with default filters', async () => {
      const metrics = await service.getEngagementMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalSessions).toBeGreaterThan(0);
      expect(metrics.averageSessionDuration).toBeGreaterThan(0);
      expect(metrics.pageViews).toBeGreaterThan(0);
      expect(metrics.bounceRate).toBeGreaterThanOrEqual(0);
      expect(metrics.bounceRate).toBeLessThanOrEqual(1);
      expect(metrics.contentInteractions).toBeGreaterThanOrEqual(0);
      expect(metrics.communityParticipation).toBeGreaterThanOrEqual(0);
      expect(metrics.period).toBeDefined();
      expect(metrics.period.startDate).toBeInstanceOf(Date);
      expect(metrics.period.endDate).toBeInstanceOf(Date);
    });

    it('should accept engagement filters', async () => {
      const filters: EngagementFilters = {
        userSegment: 'premium',
        contentType: 'course',
        communityId: '64a1b2c3d4e5f6789abcdef0',
        deviceType: 'mobile'
      };

      const metrics = await service.getEngagementMetrics(filters);

      expect(metrics).toBeDefined();
      expect(typeof metrics.totalSessions).toBe('number');
      expect(typeof metrics.averageSessionDuration).toBe('number');
    });

    it('should return realistic engagement values', async () => {
      const metrics = await service.getEngagementMetrics();

      // Session duration should be reasonable (5-25 minutes in seconds)
      expect(metrics.averageSessionDuration).toBeGreaterThanOrEqual(300);
      expect(metrics.averageSessionDuration).toBeLessThanOrEqual(1500);

      // Bounce rate should be between 0 and 1
      expect(metrics.bounceRate).toBeGreaterThanOrEqual(0);
      expect(metrics.bounceRate).toBeLessThanOrEqual(1);

      // Page views should be more than sessions
      expect(metrics.pageViews).toBeGreaterThan(metrics.totalSessions);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should return revenue metrics for given period', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const metrics = await service.getRevenueAnalytics(period);

      expect(metrics).toBeDefined();
      expect(metrics.totalRevenue).toBeGreaterThan(0);
      expect(metrics.subscriptionRevenue).toBeGreaterThan(0);
      expect(metrics.oneTimeRevenue).toBeGreaterThan(0);
      expect(metrics.averageRevenuePerUser).toBeGreaterThan(0);
      expect(metrics.monthlyRecurringRevenue).toBeGreaterThan(0);
      expect(metrics.churnRate).toBeGreaterThanOrEqual(0);
      expect(metrics.churnRate).toBeLessThanOrEqual(1);
      expect(metrics.lifetimeValue).toBeGreaterThan(0);
      expect(metrics.period).toEqual(period);
    });

    it('should calculate total revenue correctly', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const metrics = await service.getRevenueAnalytics(period);

      expect(metrics.totalRevenue).toBe(
        metrics.subscriptionRevenue + metrics.oneTimeRevenue
      );
    });

    it('should return realistic financial values', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const metrics = await service.getRevenueAnalytics(period);

      // MRR should be a portion of subscription revenue
      expect(metrics.monthlyRecurringRevenue).toBeLessThanOrEqual(metrics.subscriptionRevenue);

      // Churn rate should be reasonable (0-15%)
      expect(metrics.churnRate).toBeLessThanOrEqual(0.15);

      // LTV should be positive and reasonable
      expect(metrics.lifetimeValue).toBeGreaterThan(metrics.averageRevenuePerUser);
    });
  });

  describe('getPlatformHealth', () => {
    it('should return platform health metrics', async () => {
      const health = await service.getPlatformHealth();

      expect(health).toBeDefined();
      expect(health.systemUptime).toBeGreaterThan(99);
      expect(health.systemUptime).toBeLessThanOrEqual(100);
      expect(health.averageResponseTime).toBeGreaterThan(0);
      expect(health.errorRate).toBeGreaterThanOrEqual(0);
      expect(health.errorRate).toBeLessThanOrEqual(1);
      expect(health.activeConnections).toBeGreaterThan(0);
      expect(health.lastUpdated).toBeInstanceOf(Date);
    });

    it('should include database metrics', async () => {
      const health = await service.getPlatformHealth();

      expect(health.databasePerformance).toBeDefined();
      expect(health.databasePerformance.connectionCount).toBeGreaterThan(0);
      expect(health.databasePerformance.queryPerformance).toBeGreaterThan(0);
      expect(health.databasePerformance.storageUsed).toBeGreaterThan(0);
      expect(health.databasePerformance.indexEfficiency).toBeGreaterThan(0);
      expect(health.databasePerformance.indexEfficiency).toBeLessThanOrEqual(1);
    });

    it('should include server metrics', async () => {
      const health = await service.getPlatformHealth();

      expect(health.serverResources).toBeDefined();
      expect(health.serverResources.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(health.serverResources.cpuUsage).toBeLessThanOrEqual(1);
      expect(health.serverResources.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(health.serverResources.memoryUsage).toBeLessThanOrEqual(1);
      expect(health.serverResources.diskUsage).toBeGreaterThanOrEqual(0);
      expect(health.serverResources.diskUsage).toBeLessThanOrEqual(1);
      expect(health.serverResources.networkTraffic).toBeGreaterThan(0);
    });

    it('should return recent timestamp', async () => {
      const beforeCall = new Date();
      const health = await service.getPlatformHealth();
      const afterCall = new Date();

      expect(health.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(health.lastUpdated.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return comprehensive dashboard data', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day'
      };

      const dashboard = await service.getDashboardMetrics(period);

      expect(dashboard).toBeDefined();
      expect(dashboard.userGrowth).toBeDefined();
      expect(dashboard.engagement).toBeDefined();
      expect(dashboard.revenue).toBeDefined();
      expect(dashboard.health).toBeDefined();
    });

    it('should use provided period for time-based metrics', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const dashboard = await service.getDashboardMetrics(period);

      expect(dashboard.userGrowth.period).toEqual(period);
      expect(dashboard.revenue.period).toEqual(period);
    });
  });

  describe('getComparativeAnalytics', () => {
    it('should return current and previous period analytics', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
        granularity: 'month'
      };

      const comparative = await service.getComparativeAnalytics(period);

      expect(comparative).toBeDefined();
      expect(comparative.current).toBeDefined();
      expect(comparative.previous).toBeDefined();
      expect(comparative.comparison).toBeDefined();
    });

    it('should calculate comparison metrics', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
        granularity: 'month'
      };

      const comparative = await service.getComparativeAnalytics(period);

      expect(typeof comparative.comparison.userGrowthChange).toBe('number');
      expect(typeof comparative.comparison.engagementChange).toBe('number');
      expect(typeof comparative.comparison.revenueChange).toBe('number');
    });

    it('should handle zero previous values gracefully', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const comparative = await service.getComparativeAnalytics(period);

      expect(Number.isFinite(comparative.comparison.userGrowthChange)).toBe(true);
      expect(Number.isFinite(comparative.comparison.engagementChange)).toBe(true);
      expect(Number.isFinite(comparative.comparison.revenueChange)).toBe(true);
    });
  });

  describe('generateAnalyticsReport', () => {
    it('should generate comprehensive analytics report', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const report = await service.generateAnalyticsReport(period);

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should include report metadata in summary', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const report = await service.generateAnalyticsReport(period);

      expect(report.summary.reportPeriod).toEqual(period);
      expect(report.summary.generatedAt).toBeInstanceOf(Date);
      expect(typeof report.summary.totalUsers).toBe('number');
      expect(typeof report.summary.newUsers).toBe('number');
      expect(typeof report.summary.totalRevenue).toBe('number');
      expect(typeof report.summary.systemHealth).toBe('number');
    });

    it('should generate relevant recommendations', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const report = await service.generateAnalyticsReport(period);

      expect(report.recommendations.length).toBeGreaterThanOrEqual(0);
      if (report.recommendations.length > 0) {
        report.recommendations.forEach(recommendation => {
          expect(typeof recommendation).toBe('string');
          expect(recommendation.length).toBeGreaterThan(10);
        });
      }
    });

    it('should handle includeCharts parameter', async () => {
      const period: TimePeriod = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'month'
      };

      const reportWithCharts = await service.generateAnalyticsReport(period, true);
      const reportWithoutCharts = await service.generateAnalyticsReport(period, false);

      expect(reportWithCharts).toBeDefined();
      expect(reportWithoutCharts).toBeDefined();
      // Both should have the same structure since charts are not implemented yet
      expect(Object.keys(reportWithCharts)).toEqual(Object.keys(reportWithoutCharts));
    });
  });

  describe('recommendation generation', () => {
    it('should generate recommendations based on metrics', () => {
      const mockMetrics = {
        userGrowth: { growthRate: 2 }, // Low growth rate
        engagement: { bounceRate: 0.7 }, // High bounce rate
        revenue: { churnRate: 0.12 }, // High churn rate
        health: { 
          averageResponseTime: 250, // High response time
          serverResources: { cpuUsage: 0.85 } // High CPU usage
        }
      };

      const recommendations = (service as any).generateRecommendations(mockMetrics);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Should include recommendations for each issue
      expect(recommendations.some(r => r.includes('acquisition'))).toBe(true);
      expect(recommendations.some(r => r.includes('bounce rate'))).toBe(true);
      expect(recommendations.some(r => r.includes('retention'))).toBe(true);
      expect(recommendations.some(r => r.includes('performance'))).toBe(true);
      expect(recommendations.some(r => r.includes('CPU'))).toBe(true);
    });

    it('should not generate recommendations for good metrics', () => {
      const mockMetrics = {
        userGrowth: { growthRate: 15 }, // Good growth rate
        engagement: { bounceRate: 0.3 }, // Low bounce rate
        revenue: { churnRate: 0.05 }, // Low churn rate
        health: { 
          averageResponseTime: 100, // Good response time
          serverResources: { cpuUsage: 0.4 } // Normal CPU usage
        }
      };

      const recommendations = (service as any).generateRecommendations(mockMetrics);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBe(0);
    });
  });
});
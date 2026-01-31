import { Injectable } from '@nestjs/common';

export interface TimePeriod {
  startDate: Date;
  endDate: Date;
  granularity?: 'day' | 'week' | 'month' | 'year';
}

export interface GrowthMetrics {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  retainedUsers: number;
  churnedUsers: number;
  growthRate: number;
  period: TimePeriod;
  dailyBreakdown?: DailyMetric[];
}

export interface EngagementMetrics {
  totalSessions: number;
  averageSessionDuration: number;
  pageViews: number;
  bounceRate: number;
  contentInteractions: number;
  communityParticipation: number;
  period: TimePeriod;
}

export interface RevenueMetrics {
  totalRevenue: number;
  subscriptionRevenue: number;
  oneTimeRevenue: number;
  averageRevenuePerUser: number;
  monthlyRecurringRevenue: number;
  churnRate: number;
  lifetimeValue: number;
  period: TimePeriod;
}

export interface HealthMetrics {
  systemUptime: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  databasePerformance: DatabaseMetrics;
  serverResources: ServerMetrics;
  lastUpdated: Date;
}

export interface DatabaseMetrics {
  connectionCount: number;
  queryPerformance: number;
  storageUsed: number;
  indexEfficiency: number;
}

export interface ServerMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkTraffic: number;
}

export interface DailyMetric {
  date: Date;
  value: number;
  change?: number;
}

export interface EngagementFilters {
  userSegment?: string;
  contentType?: string;
  communityId?: string;
  deviceType?: string;
}

/**
 * AnalyticsService provides analytics calculations and data aggregation
 * Handles platform-wide metrics, user analytics, and performance monitoring
 */
@Injectable()
export class AnalyticsService {
  
  /**
   * Calculate user growth metrics for a given period
   * @param period - Time period for analysis
   */
  async calculateUserGrowth(period: TimePeriod): Promise<GrowthMetrics> {
    // In a real implementation, this would query the database
    // For now, we'll return mock data that follows realistic patterns
    
    const daysDiff = Math.ceil(
      (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Mock data generation with realistic patterns
    const totalUsers = Math.floor(1000 + Math.random() * 5000);
    const newUsers = Math.floor(daysDiff * (10 + Math.random() * 20));
    const activeUsers = Math.floor(totalUsers * (0.3 + Math.random() * 0.4));
    const retainedUsers = Math.floor(activeUsers * (0.7 + Math.random() * 0.2));
    const churnedUsers = Math.floor(totalUsers * (0.05 + Math.random() * 0.1));
    
    const previousPeriodUsers = totalUsers - newUsers;
    const growthRate = previousPeriodUsers > 0 
      ? ((newUsers / previousPeriodUsers) * 100) 
      : 0;

    // Generate daily breakdown
    const dailyBreakdown: DailyMetric[] = [];
    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(period.startDate);
      date.setDate(date.getDate() + i);
      
      dailyBreakdown.push({
        date,
        value: Math.floor(5 + Math.random() * 25),
        change: Math.floor(-5 + Math.random() * 15),
      });
    }

    return {
      totalUsers,
      newUsers,
      activeUsers,
      retainedUsers,
      churnedUsers,
      growthRate: Math.round(growthRate * 100) / 100,
      period,
      dailyBreakdown,
    };
  }

  /**
   * Get engagement metrics with optional filtering
   * @param filters - Engagement filters
   */
  async getEngagementMetrics(filters: EngagementFilters = {}): Promise<EngagementMetrics> {
    // Mock engagement data
    const totalSessions = Math.floor(5000 + Math.random() * 10000);
    const averageSessionDuration = Math.floor(300 + Math.random() * 1200); // 5-25 minutes
    const pageViews = Math.floor(totalSessions * (3 + Math.random() * 5));
    const bounceRate = Math.round((0.3 + Math.random() * 0.4) * 100) / 100;
    const contentInteractions = Math.floor(pageViews * (0.1 + Math.random() * 0.3));
    const communityParticipation = Math.floor(totalSessions * (0.05 + Math.random() * 0.15));

    return {
      totalSessions,
      averageSessionDuration,
      pageViews,
      bounceRate,
      contentInteractions,
      communityParticipation,
      period: {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        endDate: new Date(),
      },
    };
  }

  /**
   * Get revenue analytics for a given period
   * @param period - Time period for analysis
   */
  async getRevenueAnalytics(period: TimePeriod): Promise<RevenueMetrics> {
    // Mock revenue data
    const subscriptionRevenue = Math.floor(10000 + Math.random() * 50000);
    const oneTimeRevenue = Math.floor(2000 + Math.random() * 10000);
    const totalRevenue = subscriptionRevenue + oneTimeRevenue;
    const averageRevenuePerUser = Math.round((totalRevenue / 1000) * 100) / 100;
    const monthlyRecurringRevenue = Math.floor(subscriptionRevenue * 0.8);
    const churnRate = Math.round((0.05 + Math.random() * 0.1) * 100) / 100;
    const lifetimeValue = Math.round((averageRevenuePerUser / churnRate) * 100) / 100;

    return {
      totalRevenue,
      subscriptionRevenue,
      oneTimeRevenue,
      averageRevenuePerUser,
      monthlyRecurringRevenue,
      churnRate,
      lifetimeValue,
      period,
    };
  }

  /**
   * Get platform health metrics
   */
  async getPlatformHealth(): Promise<HealthMetrics> {
    // Mock health data
    const systemUptime = 99.5 + Math.random() * 0.5; // 99.5-100%
    const averageResponseTime = Math.floor(50 + Math.random() * 200); // 50-250ms
    const errorRate = Math.round((Math.random() * 0.05) * 100) / 100; // 0-5%
    const activeConnections = Math.floor(100 + Math.random() * 500);

    const databaseMetrics: DatabaseMetrics = {
      connectionCount: Math.floor(10 + Math.random() * 50),
      queryPerformance: Math.floor(10 + Math.random() * 100), // ms
      storageUsed: Math.floor(1000 + Math.random() * 5000), // MB
      indexEfficiency: Math.round((0.8 + Math.random() * 0.2) * 100) / 100,
    };

    const serverMetrics: ServerMetrics = {
      cpuUsage: Math.round((0.2 + Math.random() * 0.6) * 100) / 100, // 20-80%
      memoryUsage: Math.round((0.3 + Math.random() * 0.5) * 100) / 100, // 30-80%
      diskUsage: Math.round((0.1 + Math.random() * 0.4) * 100) / 100, // 10-50%
      networkTraffic: Math.floor(100 + Math.random() * 1000), // MB/s
    };

    return {
      systemUptime: Math.round(systemUptime * 100) / 100,
      averageResponseTime,
      errorRate,
      activeConnections,
      databasePerformance: databaseMetrics,
      serverResources: serverMetrics,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardMetrics(period: TimePeriod): Promise<{
    userGrowth: GrowthMetrics;
    engagement: EngagementMetrics;
    revenue: RevenueMetrics;
    health: HealthMetrics;
  }> {
    const [userGrowth, engagement, revenue, health] = await Promise.all([
      this.calculateUserGrowth(period),
      this.getEngagementMetrics(),
      this.getRevenueAnalytics(period),
      this.getPlatformHealth(),
    ]);

    return {
      userGrowth,
      engagement,
      revenue,
      health,
    };
  }

  /**
   * Get analytics for a specific time range with comparison to previous period
   */
  async getComparativeAnalytics(period: TimePeriod): Promise<{
    current: GrowthMetrics;
    previous: GrowthMetrics;
    comparison: {
      userGrowthChange: number;
      engagementChange: number;
      revenueChange: number;
    };
  }> {
    const periodLength = period.endDate.getTime() - period.startDate.getTime();
    const previousPeriod: TimePeriod = {
      startDate: new Date(period.startDate.getTime() - periodLength),
      endDate: period.startDate,
      granularity: period.granularity,
    };

    const [current, previous] = await Promise.all([
      this.calculateUserGrowth(period),
      this.calculateUserGrowth(previousPeriod),
    ]);

    const userGrowthChange = previous.newUsers > 0 
      ? ((current.newUsers - previous.newUsers) / previous.newUsers) * 100
      : 0;

    return {
      current,
      previous,
      comparison: {
        userGrowthChange: Math.round(userGrowthChange * 100) / 100,
        engagementChange: Math.round((Math.random() - 0.5) * 20 * 100) / 100, // Mock
        revenueChange: Math.round((Math.random() - 0.3) * 30 * 100) / 100, // Mock
      },
    };
  }

  /**
   * Generate analytics report for export
   */
  async generateAnalyticsReport(
    period: TimePeriod,
    includeCharts: boolean = false,
  ): Promise<{
    summary: any;
    metrics: any;
    recommendations: string[];
  }> {
    const metrics = await this.getDashboardMetrics(period);
    
    const summary = {
      reportPeriod: period,
      generatedAt: new Date(),
      totalUsers: metrics.userGrowth.totalUsers,
      newUsers: metrics.userGrowth.newUsers,
      totalRevenue: metrics.revenue.totalRevenue,
      systemHealth: metrics.health.systemUptime,
    };

    const recommendations = this.generateRecommendations(metrics);

    return {
      summary,
      metrics,
      recommendations,
    };
  }

  private generateRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];

    // User growth recommendations
    if (metrics.userGrowth.growthRate < 5) {
      recommendations.push('Consider implementing user acquisition campaigns to improve growth rate');
    }

    // Engagement recommendations
    if (metrics.engagement.bounceRate > 0.6) {
      recommendations.push('High bounce rate detected - review landing page experience and content quality');
    }

    // Revenue recommendations
    if (metrics.revenue.churnRate > 0.1) {
      recommendations.push('Churn rate is high - implement retention strategies and user feedback collection');
    }

    // Health recommendations
    if (metrics.health.averageResponseTime > 200) {
      recommendations.push('Response times are elevated - consider performance optimization');
    }

    if (metrics.health.serverResources.cpuUsage > 0.8) {
      recommendations.push('High CPU usage detected - consider scaling server resources');
    }

    return recommendations;
  }
}
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { User, UserDocument } from '../../../schema/user.schema';
import { Community, CommunityDocument } from '../../../schema/community.schema';
import { Order, OrderDocument } from '../../../schema/order.schema';
import { Subscription, SubscriptionDocument } from '../../../schema/subscription.schema';
import { Cours, CoursDocument } from '../../../schema/course.schema';

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
  totalCommunities: number; // Added field for Communities
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
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Cours.name) private courseModel: Model<CoursDocument>,
    @InjectConnection() private connection: Connection,
  ) {}
  
  /**
   * Calculate user growth metrics for a given period
   * @param period - Time period for analysis
   */
  async calculateUserGrowth(period: TimePeriod): Promise<GrowthMetrics> {
    const { startDate, endDate } = period;

    // Total users
    const totalUsers = await this.userModel.countDocuments();

    // Total communities
    const totalCommunities = await this.communityModel.countDocuments();

    // New users in period
    const newUsers = await this.userModel.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Previous period users (for growth calculation)
    const previousPeriodStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const previousUsers = await this.userModel.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    });

    const growthRate = previousUsers > 0 
      ? ((newUsers - previousUsers) / previousUsers) * 100 
      : (newUsers > 0 ? 100 : 0);

    // Active users (users who logged in within period)
    const activeUsers = await this.userModel.countDocuments({
      lastLoginAt: { $gte: startDate, $lte: endDate }
    });

    // For churn/retention, we'll approximate based on activity
    // Retained = Active users who joined before start date
    const retainedUsers = await this.userModel.countDocuments({
      createdAt: { $lt: startDate },
      lastLoginAt: { $gte: startDate, $lte: endDate }
    });

    // Churned = Users who joined before start date but didn't login in period
    // This is a simplistic definition of churn for non-subscription
    const churnedUsers = Math.max(0, (totalUsers - newUsers) - retainedUsers);

    // Generate daily breakdown
    const dailyBreakdown: DailyMetric[] = [];
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Aggregation for daily signups
    const dailySignups = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const signupMap = new Map(dailySignups.map(item => [item._id, item.count]));

    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      
      const value = signupMap.get(dateString) || 0;
      
      // Calculate simplistic change from random/previous for now as we don't have deep historical daily data readily available in this aggregation
      dailyBreakdown.push({
        date,
        value,
        change: 0 // Placeholder
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
      totalCommunities, // Include in return object
      dailyBreakdown,
    };
  }

  /**
   * Get engagement metrics with optional filtering
   * @param filters - Engagement filters
   */
  async getEngagementMetrics(filters: EngagementFilters = {}): Promise<EngagementMetrics> {
    // Since we don't have a dedicated "Session" or "PageView" collection yet,
    // we will infer engagement from related activities (Community joins, Orders, Course progress)
    // This is an estimation strategy until dedicated analytics collection is implemented.

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Community Participation: Number of users in communities
    // Approximated by total communities * avg members (or simple count if schema supports)
    // Here we count total communities as a proxy for engagement hubs
    const totalCommunities = await this.communityModel.countDocuments();
    
    // Content Interactions: Proxied by Orders (purchases) + New Courses
    const recentOrders = await this.orderModel.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    const totalCourses = await this.courseModel.countDocuments();

    // Estimation Logic
    // Fix: Ensure we use the real numbers without multipliers for the main dashboard display
    // Note: totalSessions is an estimated metric, but totalCommunities should be exact.
    const totalSessions = recentOrders * 5 + totalCommunities * 10 + 100; // Base baseline
    const pageViews = totalSessions * 4;
    
    return {
      totalSessions,
      averageSessionDuration: 450, // Hardcoded estimate (7.5 mins)
      pageViews,
      bounceRate: 45.5, // Hardcoded estimate
      contentInteractions: recentOrders + totalCourses,
      communityParticipation: totalCommunities, // This returns the exact count
      period: {
        startDate: thirtyDaysAgo,
        endDate: new Date(),
      },
    };
  }

  /**
   * Get revenue analytics for a given period
   * @param period - Time period for analysis
   */
  async getRevenueAnalytics(period: TimePeriod): Promise<RevenueMetrics> {
    const { startDate, endDate } = period;

    // Aggregation for total revenue in period
    const revenueAggregation = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed' // Assuming 'completed' is the success status
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;
    const transactionCount = revenueAggregation.length > 0 ? revenueAggregation[0].count : 0;

    // Subscription Revenue (recurring)
    // Assuming Subscription model has price/amount
    // If not, we estimate or query Orders with type 'subscription'
    const subscriptionRevenueAgg = await this.subscriptionModel.aggregate([
       {
         $match: {
           createdAt: { $gte: startDate, $lte: endDate },
           status: 'active'
         }
       },
       // Assuming subscription documents don't have 'amount' directly, we might need to lookup Plans
       // For simplicity/speed, we'll check if Order has type 'subscription'
    ]);
    
    // Better approach: Query Orders by type
    const subOrders = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          type: 'subscription' 
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const subscriptionRevenue = subOrders.length > 0 ? subOrders[0].total : 0;
    const oneTimeRevenue = totalRevenue - subscriptionRevenue;

    // Average Revenue Per User (ARPU)
    // Total Revenue / Active Users in Period
    const activeUsers = await this.userModel.countDocuments({
      lastLoginAt: { $gte: startDate, $lte: endDate }
    });
    
    const averageRevenuePerUser = activeUsers > 0 
      ? Math.round((totalRevenue / activeUsers) * 100) / 100 
      : 0;

    // MRR = Active Subscriptions * Avg Price
    // Simple estimation:
    const activeSubs = await this.subscriptionModel.countDocuments({ status: 'active' });
    const monthlyRecurringRevenue = activeSubs * 29; // Assuming avg plan price $29, replace with real calc if possible

    return {
      totalRevenue,
      subscriptionRevenue,
      oneTimeRevenue,
      averageRevenuePerUser,
      monthlyRecurringRevenue,
      churnRate: 2.5, // Placeholder, requires complex historical tracking
      lifetimeValue: averageRevenuePerUser * 12, // Rough LTV estimate
      period,
    };
  }

  /**
   * Get platform health metrics
   */
  async getPlatformHealth(): Promise<HealthMetrics> {
    // Real DB stats
    const dbStats = this.connection.db ? await this.connection.db.stats() : { dataSize: 0 };
    
    return {
      systemUptime: 99.98, // Hardcoded (usually from monitoring service)
      averageResponseTime: 120, // Hardcoded
      errorRate: 0.05, // Hardcoded
      activeConnections: 45, // Hardcoded
      databasePerformance: {
        connectionCount: 15, // Approximate
        queryPerformance: 12, // ms
        storageUsed: dbStats.dataSize / (1024 * 1024), // MB
        indexEfficiency: 100, // %
      },
      serverResources: {
        cpuUsage: 25,
        memoryUsage: 40,
        diskUsage: 35,
        networkTraffic: 150
      },
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
        engagementChange: 0, // Placeholder
        revenueChange: 0, // Placeholder
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
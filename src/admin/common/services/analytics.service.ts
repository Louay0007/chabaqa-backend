import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import * as os from 'node:os';
import { User, UserDocument } from '../../../schema/user.schema';
import { Community, CommunityDocument } from '../../../schema/community.schema';
import { Order, OrderDocument } from '../../../schema/order.schema';
import { Subscription, SubscriptionDocument } from '../../../schema/subscription.schema';
import { Cours, CoursDocument } from '../../../schema/course.schema';
import { Post, PostDocument } from '../../../schema/post.schema';
import { Event, EventDocument } from '../../../schema/event.schema';
import { Product, ProductDocument } from '../../../schema/product.schema';
import {
  UserLoginActivity,
  UserLoginActivityDocument,
} from '../../../schema/user-login-activity.schema';
import { SubscriptionStatus } from '../../../schema/subscription.schema';
import { TrackableContentType } from '../../../schema/content-tracking.schema';
import { Ga4ReportingService } from '../../../ga4/ga4-reporting.service';

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

export interface PlatformContentMetrics {
  totalContent: number;
  totalCourses: number;
  totalPosts: number;
  totalEvents: number;
  totalProducts: number;
}

export interface RetentionCohortMetric {
  period: string;
  size: number;
  retained: number;
  retentionRate: number;
}

export interface RetentionMetrics {
  day1Retention: number;
  day7Retention: number;
  day30Retention: number;
  overallRetention: number;
  churnRate: number;
  cohortAnalysis: RetentionCohortMetric[];
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
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(UserLoginActivity.name)
    private userLoginActivityModel: Model<UserLoginActivityDocument>,
    @InjectConnection() private connection: Connection,
    private readonly ga4ReportingService: Ga4ReportingService,
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

    const activeUsers = await this.getActiveUsersCount(startDate, endDate);

    const retainedUsers = await this.getRetainedUsersCount(startDate, endDate);

    const existingUsersBeforePeriod = await this.userModel.countDocuments({
      createdAt: { $lt: startDate },
    });
    const churnedUsers = Math.max(0, existingUsersBeforePeriod - retainedUsers);

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
   * @param period  - Optional explicit time period; defaults to last 30 days
   */
  async getEngagementMetrics(
    filters: EngagementFilters = {},
    period?: TimePeriod,
  ): Promise<EngagementMetrics> {
    const startDate = period?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = period?.endDate ?? new Date();

    // Community Participation: Number of communities (exact)
    const totalCommunities = await this.communityModel.countDocuments();

    // Content Interactions: proxied by Orders (purchases) + total courses
    const recentOrders = await this.orderModel.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    const totalCourses = await this.courseModel.countDocuments();

    // Try to source core engagement metrics from GA4
    let totalSessions = 0;
    let pageViews = 0;
    let averageSessionDuration = 0;
    let bounceRate = 0;

    try {
      const ga4Summary = await this.ga4ReportingService.getEngagementSummary(
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      );

      if (ga4Summary) {
        totalSessions = ga4Summary.totalSessions;
        pageViews = ga4Summary.pageViews;
        averageSessionDuration = ga4Summary.averageSessionDuration;
        bounceRate = ga4Summary.bounceRate; // already 0-1
      }
    } catch {
      // If GA4 is misconfigured or fails, we fall back to the previous estimation logic below.
    }

    // Fallback or complement if GA4 not available
    if (totalSessions === 0 || pageViews === 0) {
      const estimatedSessions = recentOrders * 5 + totalCommunities * 10 + 100;
      totalSessions = totalSessions || estimatedSessions;
      pageViews = pageViews || estimatedSessions * 4;
      averageSessionDuration = averageSessionDuration || 450; // 7.5 mins
      bounceRate = bounceRate || 0.455; // 45.5%
    }

    return {
      totalSessions,
      averageSessionDuration,
      pageViews,
      bounceRate,
      contentInteractions: recentOrders + totalCourses,
      communityParticipation: totalCommunities,
      period: {
        startDate,
        endDate,
      },
    };
  }

  /**
   * Get revenue analytics for a given period
   * @param period - Time period for analysis
   */
  async getRevenueAnalytics(period: TimePeriod): Promise<RevenueMetrics> {
    const { startDate, endDate } = period;

    const revenueAggregation = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'paid',
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountDT' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;
    const transactionCount = revenueAggregation.length > 0 ? revenueAggregation[0].count : 0;

    const subOrders = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'paid',
          contentType: TrackableContentType.SUBSCRIPTION,
        }
      },
      { $group: { _id: null, total: { $sum: '$amountDT' } } }
    ]);
    const subscriptionRevenue = subOrders.length > 0 ? subOrders[0].total : 0;
    const oneTimeRevenue = totalRevenue - subscriptionRevenue;

    const activeUsers = await this.getActiveUsersCount(startDate, endDate);
    
    const averageRevenuePerUser = activeUsers > 0 
      ? Math.round((totalRevenue / activeUsers) * 100) / 100 
      : 0;

    const recurringRevenueAgg = await this.subscriptionModel.aggregate([
      {
        $match: {
          status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);
    const monthlyRecurringRevenue =
      recurringRevenueAgg.length > 0 ? recurringRevenueAgg[0].total : 0;

    const subscriptionBase = await this.subscriptionModel.countDocuments({
      createdAt: { $lte: endDate },
    });
    const canceledInPeriod = await this.subscriptionModel.countDocuments({
      status: SubscriptionStatus.CANCELED,
      updatedAt: { $gte: startDate, $lte: endDate },
    });
    const churnRate =
      subscriptionBase > 0 ? Math.round((canceledInPeriod / subscriptionBase) * 10000) / 10000 : 0;

    return {
      totalRevenue,
      subscriptionRevenue,
      oneTimeRevenue,
      averageRevenuePerUser,
      monthlyRecurringRevenue,
      churnRate,
      lifetimeValue: Math.round(averageRevenuePerUser * 12 * 100) / 100,
      period,
    };
  }

  async getPlatformContentMetrics(): Promise<PlatformContentMetrics> {
    const [totalCourses, totalPosts, totalEvents, totalProducts] = await Promise.all([
      this.courseModel.countDocuments(),
      this.postModel.countDocuments(),
      this.eventModel.countDocuments(),
      this.productModel.countDocuments(),
    ]);

    return {
      totalContent: totalCourses + totalPosts + totalEvents + totalProducts,
      totalCourses,
      totalPosts,
      totalEvents,
      totalProducts,
    };
  }

  async getRetentionMetrics(period: TimePeriod): Promise<RetentionMetrics> {
    const cohortStartDate = new Date(period.endDate);
    cohortStartDate.setFullYear(cohortStartDate.getFullYear() - 1);

    const cohortUsers = await this.userModel
      .find({
        createdAt: { $gte: cohortStartDate, $lte: period.endDate },
      })
      .select({ _id: 1, createdAt: 1 })
      .lean();

    if (cohortUsers.length === 0) {
      return {
        day1Retention: 0,
        day7Retention: 0,
        day30Retention: 0,
        overallRetention: 0,
        churnRate: 0,
        cohortAnalysis: [],
      };
    }

    const activityMap = await this.getLatestActivityMap(
      cohortUsers.map((user: any) => user._id),
    );

    const day1Metrics = this.calculateRetentionWindow(cohortUsers, activityMap, period.endDate, 1);
    const day7Metrics = this.calculateRetentionWindow(cohortUsers, activityMap, period.endDate, 7);
    const day30Metrics = this.calculateRetentionWindow(cohortUsers, activityMap, period.endDate, 30);
    const cohortAnalysis = this.buildCohortAnalysis(cohortUsers, activityMap, period.endDate);

    const totalEligible =
      day1Metrics.eligibleCount + day7Metrics.eligibleCount + day30Metrics.eligibleCount;
    const overallRetention =
      totalEligible > 0
        ? Number(
            (
              (day1Metrics.retainedCount +
                day7Metrics.retainedCount +
                day30Metrics.retainedCount) /
              totalEligible
            ).toFixed(4),
          )
        : 0;

    return {
      day1Retention: day1Metrics.rate,
      day7Retention: day7Metrics.rate,
      day30Retention: day30Metrics.rate,
      overallRetention,
      churnRate: Number((1 - overallRetention).toFixed(4)),
      cohortAnalysis,
    };
  }

  /**
   * Get platform health metrics
   */
  async getPlatformHealth(): Promise<HealthMetrics> {
    const dbStats = this.connection.db ? await this.connection.db.stats() : { dataSize: 0 };
    const cpuCount = os.cpus().length || 1;
    const cpuUsage = Math.min(1, (os.loadavg()[0] || 0) / cpuCount);
    const memoryUsage = Math.min(1, 1 - os.freemem() / os.totalmem());
    
    return {
      systemUptime: 99.9,
      averageResponseTime: 120,
      errorRate: 0.0005,
      activeConnections: this.connection.readyState === 1 ? 1 : 0,
      databasePerformance: {
        connectionCount: this.connection.readyState === 1 ? 1 : 0,
        queryPerformance: 12,
        storageUsed: dbStats.dataSize / (1024 * 1024),
        indexEfficiency: 1,
      },
      serverResources: {
        cpuUsage,
        memoryUsage,
        diskUsage: 0.35,
        networkTraffic: 0.15,
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
      this.getEngagementMetrics({}, period),
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

  private async getActiveUsersCount(startDate: Date, endDate: Date): Promise<number> {
    const results = await this.userLoginActivityModel.aggregate([
      {
        $match: {
          lastLoginAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$userId',
        },
      },
      {
        $count: 'count',
      },
    ]);

    return results[0]?.count || 0;
  }

  private async getRetainedUsersCount(startDate: Date, endDate: Date): Promise<number> {
    const results = await this.userLoginActivityModel.aggregate([
      {
        $match: {
          joinedAt: { $lt: startDate },
          lastLoginAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$userId',
        },
      },
      {
        $count: 'count',
      },
    ]);

    return results[0]?.count || 0;
  }

  private async getLatestActivityMap(userIds: Types.ObjectId[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const rows = await this.userLoginActivityModel.aggregate([
      {
        $match: {
          userId: { $in: userIds },
        },
      },
      {
        $group: {
          _id: '$userId',
          lastLoginAt: { $max: '$lastLoginAt' },
        },
      },
    ]);

    return new Map(
      rows
        .filter((row) => row?._id && row?.lastLoginAt)
        .map((row) => [row._id.toString(), new Date(row.lastLoginAt)]),
    );
  }

  private calculateRetentionWindow(
    users: Array<{ _id: Types.ObjectId; createdAt: Date }>,
    activityMap: Map<string, Date>,
    endDate: Date,
    thresholdDays: number,
  ): {
    eligibleCount: number;
    retainedCount: number;
    rate: number;
  } {
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const eligibleUsers = users.filter(
      (user) => user.createdAt.getTime() + thresholdMs <= endDate.getTime(),
    );

    if (eligibleUsers.length === 0) {
      return {
        eligibleCount: 0,
        retainedCount: 0,
        rate: 0,
      };
    }

    const retainedUsers = eligibleUsers.filter((user) => {
      const lastActivity = activityMap.get(user._id.toString());
      return lastActivity && lastActivity.getTime() >= user.createdAt.getTime() + thresholdMs;
    }).length;

    return {
      eligibleCount: eligibleUsers.length,
      retainedCount: retainedUsers,
      rate: Number((retainedUsers / eligibleUsers.length).toFixed(4)),
    };
  }

  private buildCohortAnalysis(
    users: Array<{ _id: Types.ObjectId; createdAt: Date }>,
    activityMap: Map<string, Date>,
    endDate: Date,
  ): RetentionCohortMetric[] {
    const cohorts = new Map<string, Array<{ _id: Types.ObjectId; createdAt: Date }>>();

    for (const user of users) {
      const key = user.createdAt.toISOString().slice(0, 7);
      const bucket = cohorts.get(key) || [];
      bucket.push(user);
      cohorts.set(key, bucket);
    }

    return Array.from(cohorts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, cohortUsers]) => {
        const retentionWindow = this.calculateRetentionWindow(
          cohortUsers,
          activityMap,
          endDate,
          7,
        );
        const size = cohortUsers.filter(
          (user) => user.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 <= endDate.getTime(),
        ).length;
        const retained = retentionWindow.retainedCount;

        return {
          period,
          size,
          retained,
          retentionRate: retentionWindow.rate,
        };
      })
      .filter((cohort) => cohort.size > 0);
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

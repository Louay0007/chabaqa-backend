import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from '../../schema/subscription.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
  WalletTransactionType,
} from '../../schema/wallet-transaction.schema';
import {
  Payout,
  PayoutDocument,
  PayoutStatus,
  PayoutMethod,
} from '../../schema/payout.schema';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { User, UserDocument } from '../../schema/user.schema';
import {
  RevenueDashboardQueryDto,
  RevenueMetricsDto,
  TimePeriod,
} from './dto/revenue-dashboard.dto';
import { SubscriptionFiltersDto } from './dto/subscription-filters.dto';
import { TransactionFiltersDto } from './dto/transaction-filters.dto';
import {
  CalculatePayoutDto,
  InitiatePayoutDto,
  PayoutCalculationResultDto,
} from './dto/payout-calculation.dto';
import {
  GenerateFinancialReportDto,
  FinancialReportDto,
  ReportFormat,
} from './dto/financial-report.dto';
import {
  PayoutFiltersDto,
  UpdatePayoutStatusDto,
  ProcessPayoutDto,
  BulkProcessPayoutsDto,
  PayoutSummaryDto,
} from './dto/payout-management.dto';
import {
  FinancialAnalyticsQueryDto,
  RevenueByContentTypeDto,
  TopCreatorsDto,
  RevenueGrowthDto,
  PayoutAnalyticsDto,
  TransactionAnalyticsDto,
  PlatformFeesAnalyticsDto,
  FinancialHealthDto,
} from './dto/financial-analytics.dto';

@Injectable()
export class FinancialManagementService {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(WalletTransaction.name)
    private walletTransactionModel: Model<WalletTransactionDocument>,
    @InjectModel(Payout.name)
    private payoutModel: Model<PayoutDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /**
   * Get revenue dashboard metrics for a specified time period
   */
  async getRevenueDashboard(
    query: RevenueDashboardQueryDto,
  ): Promise<RevenueMetricsDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    // Get previous period for growth calculation
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousEndDate = new Date(startDate.getTime());

    // Calculate current period metrics
    const currentMetrics = await this.calculatePeriodMetrics(
      startDate,
      endDate,
    );

    // Calculate previous period metrics for growth rate
    const previousMetrics = await this.calculatePeriodMetrics(
      previousStartDate,
      previousEndDate,
    );

    // Calculate growth rate
    const growthRate =
      previousMetrics.totalRevenue > 0
        ? ((currentMetrics.totalRevenue - previousMetrics.totalRevenue) /
            previousMetrics.totalRevenue) *
          100
        : 0;

    return {
      ...currentMetrics,
      growthRate,
      period: query.period || TimePeriod.MONTH,
      startDate,
      endDate,
    };
  }

  /**
   * Get subscriptions with filtering and pagination
   */
  async getSubscriptions(filters: SubscriptionFiltersDto): Promise<{
    data: Subscription[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, ...filterCriteria } = filters;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    if (filterCriteria.status && filterCriteria.status.length > 0) {
      query.status = { $in: filterCriteria.status };
    }

    if (filterCriteria.plan && filterCriteria.plan.length > 0) {
      query.plan = { $in: filterCriteria.plan };
    }

    if (filterCriteria.creatorId) {
      query.creatorId = new Types.ObjectId(filterCriteria.creatorId);
    }

    if (filterCriteria.subscriberId) {
      query.subscriberId = new Types.ObjectId(filterCriteria.subscriberId);
    }

    if (filterCriteria.startDate || filterCriteria.endDate) {
      query.createdAt = {};
      if (filterCriteria.startDate) {
        query.createdAt.$gte = new Date(filterCriteria.startDate);
      }
      if (filterCriteria.endDate) {
        query.createdAt.$lte = new Date(filterCriteria.endDate);
      }
    }

    if (filterCriteria.cancelAtPeriodEnd !== undefined) {
      query.cancelAtPeriodEnd = filterCriteria.cancelAtPeriodEnd;
    }

    // Execute query with pagination
    const [data, total] = await Promise.all([
      this.subscriptionModel
        .find(query)
        .populate('creatorId', 'name email')
        .populate('subscriberId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.subscriptionModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get transactions with filtering and pagination
   */
  async getTransactions(filters: TransactionFiltersDto): Promise<{
    data: WalletTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, ...filterCriteria } = filters;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    if (filterCriteria.type && filterCriteria.type.length > 0) {
      query.type = { $in: filterCriteria.type };
    }

    if (filterCriteria.userId) {
      query.userId = new Types.ObjectId(filterCriteria.userId);
    }

    if (filterCriteria.startDate || filterCriteria.endDate) {
      query.createdAt = {};
      if (filterCriteria.startDate) {
        query.createdAt.$gte = new Date(filterCriteria.startDate);
      }
      if (filterCriteria.endDate) {
        query.createdAt.$lte = new Date(filterCriteria.endDate);
      }
    }

    if (filterCriteria.minAmount !== undefined || filterCriteria.maxAmount !== undefined) {
      query.amount = {};
      if (filterCriteria.minAmount !== undefined) {
        query.amount.$gte = filterCriteria.minAmount;
      }
      if (filterCriteria.maxAmount !== undefined) {
        query.amount.$lte = filterCriteria.maxAmount;
      }
    }

    if (filterCriteria.reference) {
      query.reference = { $regex: filterCriteria.reference, $options: 'i' };
    }

    // Execute query with pagination
    const [data, total] = await Promise.all([
      this.walletTransactionModel
        .find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.walletTransactionModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Calculate payout for a creator
   */
  async calculatePayout(
    dto: CalculatePayoutDto,
  ): Promise<PayoutCalculationResultDto> {
    // Validate community and creator
    const community = await this.communityModel.findById(dto.communityId);
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const creator = await this.userModel.findById(dto.creatorId);
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Verify creator owns the community
    if (community.createur.toString() !== dto.creatorId) {
      throw new BadRequestException('Creator does not own this community');
    }

    // Calculate date range
    const endDate = dto.endDate || new Date();
    const startDate = dto.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

    // Get all revenue transactions for this community
    const transactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: startDate, $lte: endDate },
        // Filter by community-related purchases
        $or: [
          { contentType: 'community', contentId: dto.communityId },
        ],
      })
      .lean()
      .exec();

    // Calculate total revenue
    const totalRevenue = transactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Get platform fee percentage (default 10% if not specified)
    const platformFeePercentage = 10; // This should come from platform settings
    const platformFeeAmount = (totalRevenue * platformFeePercentage) / 100;
    const netPayoutAmount = totalRevenue - platformFeeAmount;

    return {
      totalRevenue,
      platformFeePercentage,
      platformFeeAmount,
      netPayoutAmount,
      transactionCount: transactions.length,
      currency: 'DT',
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  /**
   * Initiate a payout transaction
   */
  async initiatePayout(dto: InitiatePayoutDto, adminId: string): Promise<Payout> {
    // Validate community and creator
    const community = await this.communityModel.findById(dto.communityId);
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const creator = await this.userModel.findById(dto.creatorId);
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Verify creator owns the community
    if (community.createur.toString() !== dto.creatorId) {
      throw new BadRequestException('Creator does not own this community');
    }

    // Generate unique reference
    const reference = `PAYOUT-${Date.now()}-${dto.communityId.substring(0, 8)}`;

    // Create payout record
    const payout = new this.payoutModel({
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(dto.creatorId),
      amount: dto.amount,
      currency: 'DT',
      status: PayoutStatus.PENDING,
      method: dto.method,
      reference,
      description: dto.description,
      adminNotes: dto.adminNotes,
      requestedAt: new Date(),
    });

    return await payout.save();
  }

  /**
   * Generate comprehensive financial report
   */
  async generateFinancialReport(
    dto: GenerateFinancialReportDto,
  ): Promise<FinancialReportDto> {
    const { startDate, endDate } = this.getDateRange(
      dto.period,
      dto.startDate,
      dto.endDate,
    );

    // Get all transactions in the period
    const transactions = await this.walletTransactionModel
      .find({
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    // Get all payouts in the period
    const payouts = await this.payoutModel
      .find({
        requestedAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    // Calculate revenue breakdown
    const revenueBreakdown = this.calculateRevenueBreakdown(transactions);

    // Calculate payout summary
    const payoutSummary = this.calculatePayoutSummary(payouts);

    // Calculate platform fees
    const platformFees = this.calculatePlatformFees(transactions);

    // Calculate growth analytics
    const growthAnalytics = await this.calculateGrowthAnalytics(
      startDate,
      endDate,
      transactions,
    );

    // Calculate transaction statistics
    const transactionStats = this.calculateTransactionStats(transactions);

    return {
      generatedAt: new Date(),
      period: dto.period,
      startDate,
      endDate,
      revenueBreakdown,
      payoutSummary,
      platformFees,
      growthAnalytics,
      transactionStats,
    };
  }

  /**
   * Get payouts with filtering and pagination
   */
  async getPayouts(filters: PayoutFiltersDto): Promise<{
    data: Payout[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, ...filterCriteria } = filters;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};

    if (filterCriteria.status && filterCriteria.status.length > 0) {
      query.status = { $in: filterCriteria.status };
    }

    if (filterCriteria.method && filterCriteria.method.length > 0) {
      query.method = { $in: filterCriteria.method };
    }

    if (filterCriteria.creatorId) {
      query.creatorId = new Types.ObjectId(filterCriteria.creatorId);
    }

    if (filterCriteria.communityId) {
      query.communityId = new Types.ObjectId(filterCriteria.communityId);
    }

    if (filterCriteria.startDate || filterCriteria.endDate) {
      query.requestedAt = {};
      if (filterCriteria.startDate) {
        query.requestedAt.$gte = new Date(filterCriteria.startDate);
      }
      if (filterCriteria.endDate) {
        query.requestedAt.$lte = new Date(filterCriteria.endDate);
      }
    }

    if (filterCriteria.minAmount !== undefined || filterCriteria.maxAmount !== undefined) {
      query.amount = {};
      if (filterCriteria.minAmount !== undefined) {
        query.amount.$gte = filterCriteria.minAmount;
      }
      if (filterCriteria.maxAmount !== undefined) {
        query.amount.$lte = filterCriteria.maxAmount;
      }
    }

    // Execute query with pagination
    const [data, total] = await Promise.all([
      this.payoutModel
        .find(query)
        .populate('creatorId', 'name email')
        .populate('communityId', 'name slug')
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.payoutModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get payout summary statistics
   */
  async getPayoutSummary(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<PayoutSummaryDto> {
    const query: any = {};

    if (filters?.startDate || filters?.endDate) {
      query.requestedAt = {};
      if (filters.startDate) {
        query.requestedAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.requestedAt.$lte = filters.endDate;
      }
    }

    const payouts = await this.payoutModel.find(query).lean().exec();

    const summary: PayoutSummaryDto = {
      totalPayouts: payouts.length,
      totalAmount: payouts.reduce((sum, p) => sum + p.amount, 0),
      pendingCount: 0,
      pendingAmount: 0,
      completedCount: 0,
      completedAmount: 0,
      failedCount: 0,
      failedAmount: 0,
      scheduledCount: 0,
      scheduledAmount: 0,
    };

    payouts.forEach((payout) => {
      switch (payout.status) {
        case PayoutStatus.PENDING:
          summary.pendingCount++;
          summary.pendingAmount += payout.amount;
          break;
        case PayoutStatus.COMPLETED:
          summary.completedCount++;
          summary.completedAmount += payout.amount;
          break;
        case PayoutStatus.FAILED:
          summary.failedCount++;
          summary.failedAmount += payout.amount;
          break;
        case PayoutStatus.SCHEDULED:
          summary.scheduledCount++;
          summary.scheduledAmount += payout.amount;
          break;
      }
    });

    return summary;
  }

  /**
   * Process a single payout
   */
  async processPayout(
    dto: ProcessPayoutDto,
    adminId: string,
  ): Promise<Payout> {
    const payout = await this.payoutModel.findById(dto.payoutId);

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot process payout with status: ${payout.status}`,
      );
    }

    // Update payout status to completed
    payout.status = PayoutStatus.COMPLETED;
    payout.processedAt = new Date();
    
    if (dto.processingNotes) {
      payout.adminNotes = dto.processingNotes;
    }

    return await payout.save();
  }

  /**
   * Process multiple payouts in bulk
   */
  async bulkProcessPayouts(
    dto: BulkProcessPayoutsDto,
    adminId: string,
  ): Promise<{
    successCount: number;
    failureCount: number;
    results: Array<{
      payoutId: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const results: Array<{
      payoutId: string;
      success: boolean;
      error?: string;
    }> = [];

    let successCount = 0;
    let failureCount = 0;

    for (const payoutId of dto.payoutIds) {
      try {
        await this.processPayout(
          { payoutId, processingNotes: dto.processingNotes },
          adminId,
        );
        results.push({ payoutId, success: true });
        successCount++;
      } catch (error) {
        results.push({
          payoutId,
          success: false,
          error: error.message,
        });
        failureCount++;
      }
    }

    return {
      successCount,
      failureCount,
      results,
    };
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(
    payoutId: string,
    dto: UpdatePayoutStatusDto,
    adminId: string,
  ): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    payout.status = dto.status;

    if (dto.adminNotes) {
      payout.adminNotes = dto.adminNotes;
    }

    // Set processedAt if status is completed
    if (dto.status === PayoutStatus.COMPLETED && !payout.processedAt) {
      payout.processedAt = new Date();
    }

    return await payout.save();
  }

  /**
   * Cancel a payout
   */
  async cancelPayout(payoutId: string, reason: string, adminId: string): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status === PayoutStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed payout');
    }

    payout.status = PayoutStatus.CANCELLED;
    payout.adminNotes = reason;

    return await payout.save();
  }

  /**
   * Get payout details by ID
   */
  async getPayoutById(payoutId: string): Promise<Payout> {
    const payout = await this.payoutModel
      .findById(payoutId)
      .populate('creatorId', 'name email')
      .populate('communityId', 'name slug')
      .lean()
      .exec();

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    return payout;
  }

  /**
   * Get revenue breakdown by content type
   */
  async getRevenueByContentType(
    query: FinancialAnalyticsQueryDto,
  ): Promise<RevenueByContentTypeDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    const transactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    const revenueByType: RevenueByContentTypeDto = {
      community: 0,
      course: 0,
      event: 0,
      product: 0,
      session: 0,
      challenge: 0,
    };

    transactions.forEach((tx) => {
      if (tx.contentType && revenueByType.hasOwnProperty(tx.contentType)) {
        revenueByType[tx.contentType] += Math.abs(tx.amount);
      }
    });

    return revenueByType;
  }

  /**
   * Get top revenue-generating creators
   */
  async getTopCreators(
    query: FinancialAnalyticsQueryDto,
    limit: number = 10,
  ): Promise<TopCreatorsDto[]> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    // Get all communities with their creators
    const communities = await this.communityModel
      .find()
      .select('_id createur name')
      .lean()
      .exec();

    // Calculate revenue per creator
    const creatorRevenueMap = new Map<string, {
      revenue: number;
      transactionCount: number;
      creatorData: any;
    }>();

    for (const community of communities) {
      const creatorId = community.createur.toString();

      // Get transactions for this community
      const transactions = await this.walletTransactionModel
        .find({
          type: WalletTransactionType.PURCHASE,
          contentType: 'community',
          contentId: community._id.toString(),
          createdAt: { $gte: startDate, $lte: endDate },
        })
        .lean()
        .exec();

      const revenue = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      if (revenue > 0) {
        const existing = creatorRevenueMap.get(creatorId);
        if (existing) {
          existing.revenue += revenue;
          existing.transactionCount += transactions.length;
        } else {
          creatorRevenueMap.set(creatorId, {
            revenue,
            transactionCount: transactions.length,
            creatorData: community.createur,
          });
        }
      }
    }

    // Get creator details and calculate payouts
    const topCreators: TopCreatorsDto[] = [];

    for (const [creatorId, data] of creatorRevenueMap.entries()) {
      const creator = await this.userModel.findById(creatorId).lean().exec();
      if (!creator) continue;

      const payouts = await this.payoutModel
        .find({
          creatorId: new Types.ObjectId(creatorId),
          status: PayoutStatus.COMPLETED,
          processedAt: { $gte: startDate, $lte: endDate },
        })
        .lean()
        .exec();

      const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);

      topCreators.push({
        creatorId,
        creatorName: creator.name || 'Unknown',
        creatorEmail: creator.email || '',
        totalRevenue: data.revenue,
        transactionCount: data.transactionCount,
        averageTransactionValue:
          data.transactionCount > 0 ? data.revenue / data.transactionCount : 0,
        totalPayouts,
      });
    }

    // Sort by revenue and return top N
    return topCreators
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  /**
   * Get revenue growth analytics
   */
  async getRevenueGrowth(
    query: FinancialAnalyticsQueryDto,
  ): Promise<RevenueGrowthDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    // Calculate previous period
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousEndDate = new Date(startDate.getTime());

    // Get current period revenue
    const currentTransactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    const currentPeriodRevenue = currentTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Get previous period revenue
    const previousTransactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: previousStartDate, $lt: previousEndDate },
      })
      .lean()
      .exec();

    const previousPeriodRevenue = previousTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Calculate growth
    const growthAmount = currentPeriodRevenue - previousPeriodRevenue;
    const growthRate =
      previousPeriodRevenue > 0
        ? (growthAmount / previousPeriodRevenue) * 100
        : 0;

    return {
      currentPeriodRevenue,
      previousPeriodRevenue,
      growthRate,
      growthAmount,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  /**
   * Get payout analytics
   */
  async getPayoutAnalytics(
    query: FinancialAnalyticsQueryDto,
  ): Promise<PayoutAnalyticsDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    const payouts = await this.payoutModel
      .find({
        requestedAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    if (payouts.length === 0) {
      return {
        totalPayouts: 0,
        totalAmount: 0,
        averagePayoutAmount: 0,
        largestPayout: 0,
        smallestPayout: 0,
        completionRate: 0,
        averageProcessingTime: 0,
        payoutsByMethod: {
          bank_transfer: 0,
          paypal: 0,
          stripe: 0,
        },
      };
    }

    const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);
    const completedPayouts = payouts.filter(
      (p) => p.status === PayoutStatus.COMPLETED,
    );

    // Calculate average processing time
    let totalProcessingTime = 0;
    let processedCount = 0;

    completedPayouts.forEach((payout) => {
      if (payout.processedAt && payout.requestedAt) {
        const processingTime =
          (payout.processedAt.getTime() - payout.requestedAt.getTime()) /
          (1000 * 60 * 60 * 24); // Convert to days
        totalProcessingTime += processingTime;
        processedCount++;
      }
    });

    const averageProcessingTime =
      processedCount > 0 ? totalProcessingTime / processedCount : 0;

    // Calculate payouts by method
    const payoutsByMethod = {
      bank_transfer: payouts
        .filter((p) => p.method === PayoutMethod.BANK_TRANSFER)
        .reduce((sum, p) => sum + p.amount, 0),
      paypal: payouts
        .filter((p) => p.method === PayoutMethod.PAYPAL)
        .reduce((sum, p) => sum + p.amount, 0),
      stripe: payouts
        .filter((p) => p.method === PayoutMethod.STRIPE)
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return {
      totalPayouts: payouts.length,
      totalAmount,
      averagePayoutAmount: totalAmount / payouts.length,
      largestPayout: Math.max(...payouts.map((p) => p.amount)),
      smallestPayout: Math.min(...payouts.map((p) => p.amount)),
      completionRate: (completedPayouts.length / payouts.length) * 100,
      averageProcessingTime,
      payoutsByMethod,
    };
  }

  /**
   * Get transaction analytics
   */
  async getTransactionAnalytics(
    query: FinancialAnalyticsQueryDto,
  ): Promise<TransactionAnalyticsDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    const transactions = await this.walletTransactionModel
      .find({
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    // Calculate previous period for growth rate
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);

    const previousTransactions = await this.walletTransactionModel
      .find({
        createdAt: { $gte: previousStartDate, $lt: startDate },
      })
      .lean()
      .exec();

    const growthRate =
      previousTransactions.length > 0
        ? ((transactions.length - previousTransactions.length) /
            previousTransactions.length) *
          100
        : 0;

    // Calculate transactions by type
    const transactionsByType: Record<string, number> = {};
    transactions.forEach((tx) => {
      transactionsByType[tx.type] = (transactionsByType[tx.type] || 0) + 1;
    });

    // Calculate total volume (only purchases)
    const purchaseTransactions = transactions.filter(
      (tx) => tx.type === WalletTransactionType.PURCHASE,
    );
    const totalVolume = purchaseTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Calculate daily average
    const daysInPeriod = Math.ceil(periodDuration / (1000 * 60 * 60 * 24));
    const dailyAverage = transactions.length / daysInPeriod;

    return {
      totalTransactions: transactions.length,
      totalVolume,
      averageValue:
        purchaseTransactions.length > 0
          ? totalVolume / purchaseTransactions.length
          : 0,
      largestTransaction:
        purchaseTransactions.length > 0
          ? Math.max(...purchaseTransactions.map((tx) => Math.abs(tx.amount)))
          : 0,
      transactionsByType,
      dailyAverage,
      growthRate,
    };
  }

  /**
   * Get platform fees analytics
   */
  async getPlatformFeesAnalytics(
    query: FinancialAnalyticsQueryDto,
  ): Promise<PlatformFeesAnalyticsDto> {
    const { startDate, endDate } = this.getDateRange(
      query.period || TimePeriod.MONTH,
      query.startDate,
      query.endDate,
    );

    const transactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    const totalRevenueBeforeFees = transactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    const platformFeePercentage = 10; // 10% platform fee
    const totalFees = totalRevenueBeforeFees * (platformFeePercentage / 100);

    // Calculate fees by content type
    const feesByContentType: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.contentType) {
        const revenue = Math.abs(tx.amount);
        const fee = revenue * (platformFeePercentage / 100);
        feesByContentType[tx.contentType] =
          (feesByContentType[tx.contentType] || 0) + fee;
      }
    });

    // Calculate growth rate
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);

    const previousTransactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: previousStartDate, $lt: startDate },
      })
      .lean()
      .exec();

    const previousRevenue = previousTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );
    const previousFees = previousRevenue * (platformFeePercentage / 100);

    const feeGrowthRate =
      previousFees > 0 ? ((totalFees - previousFees) / previousFees) * 100 : 0;

    return {
      totalFees,
      averageFeePercentage: platformFeePercentage,
      feesByContentType,
      feeGrowthRate,
      totalRevenueBeforeFees,
    };
  }

  /**
   * Get financial health indicators
   */
  async getFinancialHealth(
    query: FinancialAnalyticsQueryDto,
  ): Promise<FinancialHealthDto> {
    // Get various analytics
    const revenueGrowth = await this.getRevenueGrowth(query);
    const payoutAnalytics = await this.getPayoutAnalytics(query);
    const transactionAnalytics = await this.getTransactionAnalytics(query);

    // Calculate health scores (0-100)
    const revenueHealthScore = this.calculateRevenueHealthScore(revenueGrowth);
    const payoutHealthScore = this.calculatePayoutHealthScore(payoutAnalytics);
    const transactionHealthScore =
      this.calculateTransactionHealthScore(transactionAnalytics);

    const overallHealthScore =
      (revenueHealthScore + payoutHealthScore + transactionHealthScore) / 3;

    // Determine indicators
    const indicators = {
      revenueGrowth:
        revenueGrowth.growthRate > 5
          ? ('positive' as const)
          : revenueGrowth.growthRate < -5
          ? ('negative' as const)
          : ('stable' as const),
      payoutProcessing:
        payoutAnalytics.averageProcessingTime < 3
          ? ('healthy' as const)
          : payoutAnalytics.averageProcessingTime < 7
          ? ('delayed' as const)
          : ('critical' as const),
      transactionVolume:
        transactionAnalytics.growthRate > 5
          ? ('increasing' as const)
          : transactionAnalytics.growthRate < -5
          ? ('decreasing' as const)
          : ('stable' as const),
    };

    // Generate recommendations
    const recommendations: string[] = [];

    if (revenueGrowth.growthRate < 0) {
      recommendations.push(
        'Revenue is declining. Consider reviewing pricing strategies and marketing efforts.',
      );
    }

    if (payoutAnalytics.averageProcessingTime > 5) {
      recommendations.push(
        'Payout processing time is high. Consider streamlining the payout approval process.',
      );
    }

    if (payoutAnalytics.completionRate < 80) {
      recommendations.push(
        'Payout completion rate is low. Review failed payouts and address common issues.',
      );
    }

    if (transactionAnalytics.growthRate < 0) {
      recommendations.push(
        'Transaction volume is decreasing. Focus on user engagement and retention.',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Financial health is good. Continue monitoring key metrics.',
      );
    }

    return {
      revenueHealthScore,
      payoutHealthScore,
      transactionHealthScore,
      overallHealthScore,
      indicators,
      recommendations,
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  private getDateRange(
    period: TimePeriod,
    customStartDate?: string,
    customEndDate?: string,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case TimePeriod.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case TimePeriod.WEEK:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.MONTH:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.QUARTER:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.YEAR:
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.CUSTOM:
        if (!customStartDate || !customEndDate) {
          throw new BadRequestException(
            'Custom period requires startDate and endDate',
          );
        }
        startDate = new Date(customStartDate);
        endDate = new Date(customEndDate);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private async calculatePeriodMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<Omit<RevenueMetricsDto, 'growthRate' | 'period' | 'startDate' | 'endDate'>> {
    // Get all transactions in the period
    const transactions = await this.walletTransactionModel
      .find({
        createdAt: { $gte: startDate, $lte: endDate },
      })
      .lean()
      .exec();

    // Get all payouts in the period
    const payouts = await this.payoutModel
      .find({
        processedAt: { $gte: startDate, $lte: endDate },
        status: PayoutStatus.COMPLETED,
      })
      .lean()
      .exec();

    // Calculate revenue from purchases
    const purchaseTransactions = transactions.filter(
      (tx) => tx.type === WalletTransactionType.PURCHASE,
    );
    const totalRevenue = purchaseTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Calculate subscription revenue (recurring)
    const subscriptionRevenue = 0; // TODO: Implement subscription revenue calculation

    // One-time revenue is everything else
    const oneTimeRevenue = totalRevenue - subscriptionRevenue;

    // Calculate platform fees (10% of total revenue)
    const platformFees = totalRevenue * 0.1;

    // Calculate creator payouts
    const creatorPayouts = payouts.reduce((sum, payout) => sum + payout.amount, 0);

    // Calculate transaction count and average
    const transactionCount = purchaseTransactions.length;
    const averageTransactionValue =
      transactionCount > 0 ? totalRevenue / transactionCount : 0;

    return {
      totalRevenue,
      subscriptionRevenue,
      oneTimeRevenue,
      platformFees,
      creatorPayouts,
      transactionCount,
      averageTransactionValue,
    };
  }

  private calculateRevenueBreakdown(transactions: WalletTransaction[]): any {
    const purchaseTransactions = transactions.filter(
      (tx) => tx.type === WalletTransactionType.PURCHASE,
    );

    const totalRevenue = purchaseTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    // Calculate revenue by content type
    const revenueByContentType = {
      community: 0,
      course: 0,
      event: 0,
      product: 0,
      session: 0,
      challenge: 0,
    };

    purchaseTransactions.forEach((tx) => {
      if (tx.contentType && revenueByContentType.hasOwnProperty(tx.contentType)) {
        revenueByContentType[tx.contentType] += Math.abs(tx.amount);
      }
    });

    return {
      totalRevenue,
      subscriptionRevenue: 0, // TODO: Implement
      oneTimeRevenue: totalRevenue,
      revenueByContentType,
    };
  }

  private calculatePayoutSummary(payouts: Payout[]): any {
    const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);
    const completedPayouts = payouts
      .filter((p) => p.status === PayoutStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingPayouts = payouts
      .filter((p) => p.status === PayoutStatus.PENDING)
      .reduce((sum, p) => sum + p.amount, 0);
    const failedPayouts = payouts
      .filter((p) => p.status === PayoutStatus.FAILED)
      .reduce((sum, p) => sum + p.amount, 0);

    const payoutsByMethod = {
      bank_transfer: payouts
        .filter((p) => p.method === PayoutMethod.BANK_TRANSFER)
        .reduce((sum, p) => sum + p.amount, 0),
      paypal: payouts
        .filter((p) => p.method === PayoutMethod.PAYPAL)
        .reduce((sum, p) => sum + p.amount, 0),
      stripe: payouts
        .filter((p) => p.method === PayoutMethod.STRIPE)
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return {
      totalPayouts,
      completedPayouts,
      pendingPayouts,
      failedPayouts,
      payoutsByMethod,
    };
  }

  private calculatePlatformFees(transactions: WalletTransaction[]): any {
    const purchaseTransactions = transactions.filter(
      (tx) => tx.type === WalletTransactionType.PURCHASE,
    );

    const totalRevenue = purchaseTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    const totalFees = totalRevenue * 0.1; // 10% platform fee

    const feesByContentType: Record<string, number> = {};
    purchaseTransactions.forEach((tx) => {
      if (tx.contentType) {
        const revenue = Math.abs(tx.amount);
        const fee = revenue * 0.1;
        feesByContentType[tx.contentType] =
          (feesByContentType[tx.contentType] || 0) + fee;
      }
    });

    return {
      totalFees,
      averageFeePercentage: 10,
      feesByContentType,
    };
  }

  private async calculateGrowthAnalytics(
    startDate: Date,
    endDate: Date,
    transactions: WalletTransaction[],
  ): Promise<any> {
    // Calculate previous period
    const periodDuration = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - periodDuration);

    const previousTransactions = await this.walletTransactionModel
      .find({
        type: WalletTransactionType.PURCHASE,
        createdAt: { $gte: previousStartDate, $lt: startDate },
      })
      .lean()
      .exec();

    const currentRevenue = transactions
      .filter((tx) => tx.type === WalletTransactionType.PURCHASE)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const previousRevenue = previousTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    const revenueGrowthRate =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : 0;

    const transactionGrowthRate =
      previousTransactions.length > 0
        ? ((transactions.length - previousTransactions.length) /
            previousTransactions.length) *
          100
        : 0;

    const averageTransactionValue =
      transactions.length > 0 ? currentRevenue / transactions.length : 0;

    // Get top revenue creators (placeholder)
    const topRevenueCreators: Array<{
      creatorId: string;
      creatorName: string;
      revenue: number;
    }> = [];

    return {
      revenueGrowthRate,
      transactionGrowthRate,
      averageTransactionValue,
      topRevenueCreators,
    };
  }

  private calculateTransactionStats(transactions: WalletTransaction[]): any {
    const totalTransactions = transactions.length;

    const transactionsByType: Record<string, number> = {};
    transactions.forEach((tx) => {
      transactionsByType[tx.type] = (transactionsByType[tx.type] || 0) + 1;
    });

    const purchaseTransactions = transactions.filter(
      (tx) => tx.type === WalletTransactionType.PURCHASE,
    );

    const totalRevenue = purchaseTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );

    const averageTransactionValue =
      purchaseTransactions.length > 0
        ? totalRevenue / purchaseTransactions.length
        : 0;

    const largestTransaction =
      purchaseTransactions.length > 0
        ? Math.max(...purchaseTransactions.map((tx) => Math.abs(tx.amount)))
        : 0;

    return {
      totalTransactions,
      transactionsByType,
      averageTransactionValue,
      largestTransaction,
    };
  }

  private calculateRevenueHealthScore(revenueGrowth: RevenueGrowthDto): number {
    // Score based on growth rate
    // Positive growth: 60-100
    // Stable (±5%): 40-60
    // Negative growth: 0-40

    if (revenueGrowth.growthRate > 20) return 100;
    if (revenueGrowth.growthRate > 10) return 90;
    if (revenueGrowth.growthRate > 5) return 75;
    if (revenueGrowth.growthRate > 0) return 60;
    if (revenueGrowth.growthRate > -5) return 50;
    if (revenueGrowth.growthRate > -10) return 35;
    if (revenueGrowth.growthRate > -20) return 20;
    return 10;
  }

  private calculatePayoutHealthScore(payoutAnalytics: PayoutAnalyticsDto): number {
    // Score based on completion rate and processing time
    let score = 0;

    // Completion rate (0-60 points)
    score += (payoutAnalytics.completionRate / 100) * 60;

    // Processing time (0-40 points)
    if (payoutAnalytics.averageProcessingTime < 2) {
      score += 40;
    } else if (payoutAnalytics.averageProcessingTime < 3) {
      score += 35;
    } else if (payoutAnalytics.averageProcessingTime < 5) {
      score += 25;
    } else if (payoutAnalytics.averageProcessingTime < 7) {
      score += 15;
    } else {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateTransactionHealthScore(
    transactionAnalytics: TransactionAnalyticsDto,
  ): number {
    // Score based on growth rate and volume
    let score = 50; // Base score

    // Growth rate adjustment (±50 points)
    if (transactionAnalytics.growthRate > 20) {
      score += 50;
    } else if (transactionAnalytics.growthRate > 10) {
      score += 35;
    } else if (transactionAnalytics.growthRate > 5) {
      score += 20;
    } else if (transactionAnalytics.growthRate > 0) {
      score += 10;
    } else if (transactionAnalytics.growthRate > -5) {
      score -= 10;
    } else if (transactionAnalytics.growthRate > -10) {
      score -= 25;
    } else {
      score -= 40;
    }

    return Math.min(100, Math.max(0, score));
  }
}

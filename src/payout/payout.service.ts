import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payout, PayoutDocument, PayoutStatus, PayoutMethod } from '../schema/payout.schema';
import { User, UserDocument } from '../schema/user.schema';
import { Order, OrderDocument } from '../schema/order.schema';
import { Community, CommunityDocument } from '../schema/community.schema';

export interface CreatePayoutDto {
  creatorId: string;
  amount: number;
  currency?: string;
  method: PayoutMethod;
  description?: string;
  scheduledFor?: Date;
  itemsCount?: number;
  metadata?: any;
  communityId: string;
}

export interface UpdatePayoutDto {
  status?: PayoutStatus;
  processedAt?: Date;
  adminNotes?: string;
  exported?: boolean;
}

export interface GetPayoutsQuery {
  creatorId?: string;
  communityId?: string;
  status?: PayoutStatus;
  method?: PayoutMethod;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

interface CreatorBankDetails {
  rib: string;
  bankName: string;
  ownerName: string;
}

@Injectable()
export class PayoutService {
  constructor(
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Community.name) private readonly communityModel: Model<CommunityDocument>,
  ) { }

  /**
   * Generate a unique reference ID for payouts
   */
  private generateReference(): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `REF-${date}-${random}`;
  }

  private normalizeBankDetails(bankDetails?: Partial<CreatorBankDetails>): CreatorBankDetails | null {
    const rib = String(bankDetails?.rib || '').replace(/\s+/g, '');
    const bankName = String(bankDetails?.bankName || '').trim();
    const ownerName = String(bankDetails?.ownerName || '').trim();

    if (!rib && !bankName && !ownerName) {
      return null;
    }

    return {
      rib,
      bankName,
      ownerName,
    };
  }

  private ensureValidBankDetails(bankDetails?: Partial<CreatorBankDetails>): CreatorBankDetails {
    const normalized = this.normalizeBankDetails(bankDetails);
    if (!normalized) {
      throw new BadRequestException('Bank details are required');
    }

    if (!/^\d{20}$/.test(normalized.rib)) {
      throw new BadRequestException('Invalid Tunisian RIB. It must contain exactly 20 digits.');
    }

    if (!normalized.bankName) {
      throw new BadRequestException('Bank name is required');
    }

    if (!normalized.ownerName) {
      throw new BadRequestException('Account holder name is required');
    }

    return normalized;
  }

  async getCreatorBankCredentials(creatorId: string): Promise<{
    isConfigured: boolean;
    bankDetails: CreatorBankDetails | null;
  }> {
    const creator = await this.userModel.findById(creatorId).select('bankDetails');
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    const normalized = this.normalizeBankDetails((creator as any).bankDetails);
    if (!normalized) {
      return { isConfigured: false, bankDetails: null };
    }

    const isConfigured =
      /^\d{20}$/.test(normalized.rib) &&
      Boolean(normalized.bankName) &&
      Boolean(normalized.ownerName);

    return {
      isConfigured,
      bankDetails: normalized,
    };
  }

  async updateCreatorBankCredentials(
    creatorId: string,
    bankDetails: Partial<CreatorBankDetails>,
  ): Promise<{ isConfigured: boolean; bankDetails: CreatorBankDetails }> {
    const validated = this.ensureValidBankDetails(bankDetails);

    const updatedCreator = await this.userModel.findByIdAndUpdate(
      creatorId,
      {
        bankDetails: validated,
      },
      { new: true },
    ).select('bankDetails');

    if (!updatedCreator) {
      throw new NotFoundException('Creator not found');
    }

    return {
      isConfigured: true,
      bankDetails: validated,
    };
  }

  /**
   * Create a new payout request
   */
  async createPayout(createPayoutDto: CreatePayoutDto): Promise<Payout> {
    const {
      creatorId,
      amount,
      currency = 'TND',
      method,
      description,
      scheduledFor,
      itemsCount = 0,
      metadata,
      communityId
    } = createPayoutDto;

    // Require community context
    if (!communityId) {
      throw new BadRequestException('communityId is required for payouts');
    }

    // Validate community and ownership
    const community = await this.communityModel.findById(communityId).select('createur');
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    if (community.createur?.toString() !== creatorId.toString()) {
      throw new BadRequestException('You can only request payouts for your own community');
    }

    // Validate creator exists
    const creator = await this.userModel.findById(creatorId);
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException('Payout amount must be greater than 0');
    }

    let payoutMetadata = metadata ? { ...metadata } : {};
    if (method === PayoutMethod.BANK_TRANSFER) {
      const validBankDetails = this.ensureValidBankDetails((creator as any).bankDetails);
      payoutMetadata = {
        ...payoutMetadata,
        bankAccount: {
          ...(payoutMetadata as any)?.bankAccount,
          rib: validBankDetails.rib,
          bankName: validBankDetails.bankName,
          ownerName: validBankDetails.ownerName,
          countryCode: 'TN',
        },
      };
    }

    // Create payout record
    const payoutData = {
      creatorId,
      communityId: new Types.ObjectId(communityId),
      amount,
      currency,
      method,
      description,
      scheduledFor,
      itemsCount,
      metadata: payoutMetadata,
      reference: this.generateReference(),
      status: scheduledFor ? PayoutStatus.SCHEDULED : PayoutStatus.PENDING,
    };

    return await this.payoutModel.create(payoutData);
  }

  /**
   * Get all payouts with optional filtering
   */
  async getPayouts(query: GetPayoutsQuery): Promise<{
    payouts: Payout[];
    total: number;
    page: number;
    limit: number;
    totalAmounts: {
      pending: number;
      completed: number;
      failed: number;
      total: number;
    };
  }> {
    const {
      creatorId,
      communityId,
      status,
      method,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = query;

    // Build filter
    const filter: any = {};
    if (creatorId) filter.creatorId = new Types.ObjectId(creatorId);
    if (communityId) {
      filter.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId)
        : communityId;
    }
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute queries
    const [payouts, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .populate('creatorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.payoutModel.countDocuments(filter)
    ]);

    // Calculate total amounts by status
    const stats = await this.payoutModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalAmounts = {
      pending: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    stats.forEach(stat => {
      if (stat._id === PayoutStatus.PENDING) totalAmounts.pending = stat.totalAmount;
      else if (stat._id === PayoutStatus.COMPLETED) totalAmounts.completed = stat.totalAmount;
      else if (stat._id === PayoutStatus.FAILED) totalAmounts.failed = stat.totalAmount;
      totalAmounts.total += stat.totalAmount;
    });

    return {
      payouts,
      total,
      page,
      limit,
      totalAmounts
    };
  }

  /**
   * Get a specific payout by ID
   */
  async getPayout(payoutId: string): Promise<Payout | null> {
    return await this.payoutModel
      .findById(payoutId)
      .populate('creatorId', 'name email')
      .exec();
  }

  /**
   * Update a payout
   */
  async updatePayout(payoutId: string, updateDto: UpdatePayoutDto): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    // Update fields
    Object.assign(payout, updateDto);

    // If status changed to completed, set processedAt
    if (updateDto.status === PayoutStatus.COMPLETED && !payout.processedAt) {
      payout.processedAt = new Date();
    }

    return await payout.save();
  }

  /**
   * Process a payout (mark as completed)
   */
  async processPayout(payoutId: string, processedBy?: string): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status === PayoutStatus.COMPLETED) {
      throw new BadRequestException('Payout is already processed');
    }

    payout.status = PayoutStatus.COMPLETED;
    payout.processedAt = new Date();
    payout.adminNotes = processedBy
      ? `Processed by ${processedBy} on ${new Date().toISOString()}`
      : `Processed automatically on ${new Date().toISOString()}`;

    return await payout.save();
  }

  /**
   * Cancel a payout
   */
  async cancelPayout(payoutId: string, reason?: string, cancelledBy?: string): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status === PayoutStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed payout');
    }

    payout.status = PayoutStatus.CANCELLED;
    payout.adminNotes = `Cancelled by ${cancelledBy || 'system'}: ${reason || 'No reason provided'}`;

    return await payout.save();
  }

  /**
   * Get payouts by creator (and optional community), with available balance calculation.
   * Includes fallback: if community filter yields no earnings/payouts, retry without the filter.
   */
  async getPayoutsByCreator(creatorId: string, query: Partial<GetPayoutsQuery> = {}): Promise<{
    payouts: Payout[];
    total: number;
    availableBalance: number;
    nextPayout?: Payout;
  }> {
    const result = await this.getPayouts({
      creatorId,
      ...query
    });

    // Earnings from paid orders (optionally filtered by community)
    const earningsMatch: any = {
      creatorId: new Types.ObjectId(creatorId),
      status: 'paid'
    };
    if (query.communityId) {
      earningsMatch.communityId = Types.ObjectId.isValid(query.communityId)
        ? new Types.ObjectId(query.communityId)
        : query.communityId;
    }

    const totalEarningsPipeline = [
      {
        $match: earningsMatch
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$creatorNetDT' }
        }
      }
    ];
    if (query.communityId) {
      totalEarningsPipeline[0].$match.communityId = Types.ObjectId.isValid(query.communityId)
        ? new Types.ObjectId(query.communityId)
        : query.communityId;
    }

    let totalEarningsResult = await this.orderModel.aggregate(totalEarningsPipeline);
    if (query.communityId && totalEarningsResult.length === 0) {
      // Fallback to all communities if community filter produced no earnings
      totalEarningsResult = await this.orderModel.aggregate([
        {
          $match: {
            creatorId: new Types.ObjectId(creatorId),
            status: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$creatorNetDT' }
          }
        }
      ]);
    }

    const totalEarnings = totalEarningsResult[0]?.total ?? 0;

    // Payouts already requested (completed + pending + scheduled)
    const payoutMatch: any = {
      creatorId: new Types.ObjectId(creatorId),
      status: { $in: [PayoutStatus.COMPLETED, PayoutStatus.PENDING, PayoutStatus.SCHEDULED] }
    };
    if (query.communityId) {
      payoutMatch.communityId = Types.ObjectId.isValid(query.communityId)
        ? new Types.ObjectId(query.communityId)
        : query.communityId;
    }

    let payoutTotals = await this.payoutModel.aggregate([
      { $match: payoutMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    if (query.communityId && payoutTotals.length === 0) {
      payoutTotals = await this.payoutModel.aggregate([
        {
          $match: {
            creatorId: new Types.ObjectId(creatorId),
            status: { $in: [PayoutStatus.COMPLETED, PayoutStatus.PENDING, PayoutStatus.SCHEDULED] }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
    }
    const totalPayouts = payoutTotals[0]?.total || 0;

    const availableBalance = Math.max(0, totalEarnings - totalPayouts);

    const nextPayout = result.payouts.find(p => p.status === PayoutStatus.SCHEDULED)
      || result.payouts.find(p => p.status === PayoutStatus.PENDING);

    return {
      payouts: result.payouts,
      total: result.total,
      availableBalance,
      nextPayout
    };
  }

  /**
   * Get payout statistics for a creator (optionally filtered by community)
   */
  async getPayoutStats(creatorId: string, communityId?: string): Promise<{
    totalPaid: number;
    pendingAmount: number;
    totalPayouts: number;
    successRate: number;
    averagePayout: number;
    recentPayouts: Payout[];
  }> {
    const match: any = { creatorId: new Types.ObjectId(creatorId) };
    if (communityId) {
      match.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId)
        : communityId;
    }

    const stats = await this.payoutModel.aggregate([
      {
        $match: match
      },
      {
        $group: {
          _id: null,
          totalPaid: {
            $sum: {
              $cond: [
                { $eq: ['$status', PayoutStatus.COMPLETED] },
                '$amount',
                0
              ]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [
                {
                  $in: ['$status', [PayoutStatus.PENDING, PayoutStatus.SCHEDULED]]
                },
                '$amount',
                0
              ]
            }
          },
          totalPayouts: { $sum: 1 },
          completedPayouts: {
            $sum: {
              $cond: [{ $eq: ['$status', PayoutStatus.COMPLETED] }, 1, 0]
            }
          },
          failedPayouts: {
            $sum: {
              $cond: [{ $eq: ['$status', PayoutStatus.FAILED] }, 1, 0]
            }
          },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const recentFilter: any = { creatorId: new Types.ObjectId(creatorId) };
    if (communityId) {
      recentFilter.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId)
        : communityId;
    }

    const recentPayouts = await this.payoutModel
      .find(recentFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    const result = stats[0] || {
      totalPaid: 0,
      pendingAmount: 0,
      totalPayouts: 0,
      completedPayouts: 0,
      failedPayouts: 0,
      totalAmount: 0
    };

    const successRate = result.totalPayouts > 0
      ? (result.completedPayouts / result.totalPayouts) * 100
      : 0;

    const averagePayout = result.totalPayouts > 0
      ? result.totalAmount / result.totalPayouts
      : 0;

    return {
      totalPaid: result.totalPaid,
      pendingAmount: result.pendingAmount,
      totalPayouts: result.totalPayouts,
      successRate,
      averagePayout,
      recentPayouts
    };
  }

  /**
   * Export payouts for accounting
   */
  async exportPayouts(creatorId?: string, communityId?: string, startDate?: Date, endDate?: Date): Promise<Payout[]> {
    const filter: any = {};
    if (creatorId) filter.creatorId = new Types.ObjectId(creatorId);
    if (communityId) {
      filter.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId)
        : communityId;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    return await this.payoutModel
      .find(filter)
      .populate('creatorId', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }
}

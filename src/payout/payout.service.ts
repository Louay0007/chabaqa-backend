import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payout, PayoutDocument, PayoutStatus, PayoutMethod } from '../schema/payout.schema';
import { User, UserDocument } from '../schema/user.schema';

export interface CreatePayoutDto {
  creatorId: string;
  amount: number;
  currency?: string;
  method: PayoutMethod;
  description?: string;
  scheduledFor?: Date;
  itemsCount?: number;
  metadata?: any;
}

export interface UpdatePayoutDto {
  status?: PayoutStatus;
  processedAt?: Date;
  adminNotes?: string;
  exported?: boolean;
}

export interface GetPayoutsQuery {
  creatorId?: string;
  status?: PayoutStatus;
  method?: PayoutMethod;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class PayoutService {
  constructor(
    @InjectModel(Payout.name) private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Generate a unique reference ID for payouts
   */
  private generateReference(): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `REF-${date}-${random}`;
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
      metadata
    } = createPayoutDto;

    // Validate creator exists
    const creator = await this.userModel.findById(creatorId);
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException('Payout amount must be greater than 0');
    }

    // Create payout record
    const payoutData = {
      creatorId,
      amount,
      currency,
      method,
      description,
      scheduledFor,
      itemsCount,
      metadata,
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
  async getPayoutById(payoutId: string): Promise<Payout | null> {
    return await this.payoutModel
      .findById(payoutId)
      .populate('creatorId', 'name email')
      .exec();
  }

  /**
   * Get payouts by creator
   */
  async getPayoutsByCreator(creatorId: string, query?: Partial<GetPayoutsQuery>): Promise<{
    payouts: Payout[];
    total: number;
    availableBalance: number;
    nextPayout?: Payout;
  }> {
    const result = await this.getPayouts({
      creatorId,
      ...query
    });

    // Calculate available balance (pending + scheduled payouts)
    const availableBalance = await this.payoutModel
      .aggregate([
        {
          $match: {
            creatorId: new Types.ObjectId(creatorId),
            status: { $in: [PayoutStatus.PENDING, PayoutStatus.SCHEDULED] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ])
      .exec();

    // Get next scheduled payout
    const nextPayout = await this.payoutModel
      .findOne({
        creatorId: new Types.ObjectId(creatorId),
        status: PayoutStatus.SCHEDULED,
        scheduledFor: { $gte: new Date() }
      })
      .sort({ scheduledFor: 1 })
      .exec();

    return {
      payouts: result.payouts,
      total: result.total,
      availableBalance: availableBalance[0]?.total || 0,
      nextPayout: nextPayout || undefined
    };
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
   * Get payout statistics for a creator
   */
  async getPayoutStats(creatorId: string): Promise<{
    totalPaid: number;
    pendingAmount: number;
    totalPayouts: number;
    successRate: number;
    averagePayout: number;
    recentPayouts: Payout[];
  }> {
    const stats = await this.payoutModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(creatorId)
        }
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

    const recentPayouts = await this.payoutModel
      .find({
        creatorId: new Types.ObjectId(creatorId)
      })
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
  async exportPayouts(creatorId?: string, startDate?: Date, endDate?: Date): Promise<Payout[]> {
    const filter: any = {};
    if (creatorId) filter.creatorId = new Types.ObjectId(creatorId);
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
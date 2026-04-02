import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PromoCode, PromoCodeDocument } from '../schema/promo-code.schema';
import { Order, OrderDocument } from '../schema/order.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreatePromoCodeDto, UpdatePromoCodeDto, PromoCodeResponseDto, PromoCodeUsageDto, PromoCodeStatsDto } from './dto';

@Injectable()
export class PromoCodeService {
  constructor(
    @InjectModel(PromoCode.name) private promoModel: Model<PromoCodeDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Create a new promo code
   */
  async create(createDto: CreatePromoCodeDto, creatorId?: string): Promise<PromoCodeResponseDto> {
    // Validate that at least one discount type is provided
    if (!createDto.percentOff && !createDto.amountOffDT) {
      throw new BadRequestException('At least one discount type (percentOff or amountOffDT) must be provided');
    }

    // Normalize code to uppercase
    const code = createDto.code.trim().toUpperCase();

    // Check if code already exists
    const existing = await this.promoModel.findOne({ code });
    if (existing) {
      throw new ConflictException(`Promo code "${code}" already exists`);
    }

    // Validate dates
    if (createDto.startsAt && createDto.endsAt) {
      const start = new Date(createDto.startsAt);
      const end = new Date(createDto.endsAt);
      if (start >= end) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    // Create promo code
    const promoData: any = {
      code,
      percentOff: createDto.percentOff || null,
      amountOffDT: createDto.amountOffDT || null,
      appliesToType: createDto.appliesToType || null,
      appliesToId: createDto.appliesToId || null,
      creatorId: createDto.creatorId ? new Types.ObjectId(createDto.creatorId) : (creatorId ? new Types.ObjectId(creatorId) : null),
      communityId: createDto.communityId || null,
      startsAt: createDto.startsAt ? new Date(createDto.startsAt) : null,
      endsAt: createDto.endsAt ? new Date(createDto.endsAt) : null,
      maxRedemptions: createDto.maxRedemptions || null,
      redemptionsCount: 0,
      isActive: createDto.isActive !== undefined ? createDto.isActive : true,
      allowedEmails: createDto.allowedEmails || [],
    };

    const promo = await this.promoModel.create(promoData);
    return this.toResponseDto(promo);
  }

  /**
   * Get all promo codes with filtering
   */
  async findAll(filters?: {
    creatorId?: string;
    communityId?: string;
    isActive?: boolean;
    appliesToType?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: PromoCodeResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (filters?.creatorId) {
      query.creatorId = new Types.ObjectId(filters.creatorId);
    }
    if (filters?.communityId) {
      query.communityId = filters.communityId;
    }
    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }
    if (filters?.appliesToType) {
      query.appliesToType = filters.appliesToType;
    }

    const [data, total] = await Promise.all([
      this.promoModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.promoModel.countDocuments(query),
    ]);

    return {
      data: data.map(promo => this.toResponseDto(promo)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single promo code by code
   */
  async findByCode(code: string): Promise<PromoCodeResponseDto> {
    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() }).lean();
    if (!promo) {
      throw new NotFoundException(`Promo code "${code}" not found`);
    }
    return this.toResponseDto(promo);
  }

  /**
   * Get a single promo code by ID
   */
  async findById(id: string): Promise<PromoCodeResponseDto> {
    const promo = await this.promoModel.findById(id).lean();
    if (!promo) {
      throw new NotFoundException(`Promo code not found`);
    }
    return this.toResponseDto(promo);
  }

  /**
   * Update a promo code
   */
  async update(code: string, updateDto: UpdatePromoCodeDto): Promise<PromoCodeResponseDto> {
    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() });
    if (!promo) {
      throw new NotFoundException(`Promo code "${code}" not found`);
    }

    // Validate dates if both are provided
    if (updateDto.startsAt && updateDto.endsAt) {
      const start = new Date(updateDto.startsAt);
      const end = new Date(updateDto.endsAt);
      if (start >= end) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    // Update fields
    if (updateDto.percentOff !== undefined) promo.percentOff = updateDto.percentOff || undefined;
    if (updateDto.amountOffDT !== undefined) promo.amountOffDT = updateDto.amountOffDT || undefined;
    if (updateDto.appliesToType !== undefined) promo.appliesToType = updateDto.appliesToType || null;
    if (updateDto.appliesToId !== undefined) promo.appliesToId = updateDto.appliesToId || null;
    if (updateDto.startsAt !== undefined) promo.startsAt = updateDto.startsAt ? new Date(updateDto.startsAt) : null;
    if (updateDto.endsAt !== undefined) promo.endsAt = updateDto.endsAt ? new Date(updateDto.endsAt) : null;
    if (updateDto.maxRedemptions !== undefined) promo.maxRedemptions = updateDto.maxRedemptions || null;
    if (updateDto.isActive !== undefined) promo.isActive = updateDto.isActive;
    if (updateDto.allowedEmails !== undefined) promo.allowedEmails = updateDto.allowedEmails || [];

    await promo.save();
    return this.toResponseDto(promo);
  }

  /**
   * Delete a promo code
   */
  async delete(code: string): Promise<{ message: string }> {
    const result = await this.promoModel.deleteOne({ code: code.trim().toUpperCase() });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Promo code "${code}" not found`);
    }
    return { message: `Promo code "${code}" deleted successfully` };
  }

  /**
   * Get usage statistics for a promo code
   */
  async getStats(code: string): Promise<PromoCodeStatsDto> {
    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() }).lean();
    if (!promo) {
      throw new NotFoundException(`Promo code "${code}" not found`);
    }

    // Get all orders that used this promo code
    const orders = await this.orderModel
      .find({ 
        promoCode: code.trim().toUpperCase(),
        status: 'paid'
      })
      .lean();

    const totalUses = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.amountDT || 0), 0);
    const totalDiscounts = orders.reduce((sum, order) => sum + (order.discountDT || 0), 0);
    const averageDiscount = totalUses > 0 ? totalDiscounts / totalUses : 0;

    const remainingUses = promo.maxRedemptions 
      ? Math.max(0, promo.maxRedemptions - promo.redemptionsCount)
      : undefined;

    return {
      code: promo.code,
      totalUses,
      totalRevenue,
      totalDiscounts,
      averageDiscount,
      maxRedemptions: promo.maxRedemptions || undefined,
      remainingUses,
      isActive: promo.isActive,
      startsAt: promo.startsAt || undefined,
      endsAt: promo.endsAt || undefined,
    };
  }

  /**
   * Get all users who used a specific promo code
   */
  async getUsage(code: string, page: number = 1, limit: number = 20): Promise<{
    data: PromoCodeUsageDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() });
    if (!promo) {
      throw new NotFoundException(`Promo code "${code}" not found`);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find({ promoCode: code.trim().toUpperCase() })
        .populate('buyerId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.orderModel.countDocuments({ promoCode: code.trim().toUpperCase() }),
    ]);

    const data: PromoCodeUsageDto[] = orders.map((order: any) => ({
      orderId: order._id.toString(),
      buyerId: order.buyerId.toString(),
      buyerEmail: order.buyerId?.email || 'N/A',
      buyerName: order.buyerId?.name || 'N/A',
      originalAmount: (order.amountDT || 0) + (order.discountDT || 0),
      discountAmount: order.discountDT || 0,
      finalAmount: order.amountDT || 0,
      contentType: order.contentType,
      contentId: order.contentId,
      contentTitle: undefined, // Can be populated if needed
      usedAt: order.createdAt,
      orderStatus: order.status,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Increment redemption count (called after successful payment)
   */
  async incrementRedemptionCount(code: string): Promise<void> {
    await this.promoModel.updateOne(
      { code: code.trim().toUpperCase() },
      { $inc: { redemptionsCount: 1 } }
    );
  }

  /**
   * Get promo codes for a specific creator
   */
  async getCreatorPromoCodes(creatorId: string): Promise<PromoCodeResponseDto[]> {
    const promos = await this.promoModel
      .find({ creatorId: new Types.ObjectId(creatorId) })
      .sort({ createdAt: -1 })
      .lean();

    return promos.map(promo => this.toResponseDto(promo));
  }

  /**
   * Convert database document to response DTO
   */
  private toResponseDto(promo: any): PromoCodeResponseDto {
    return {
      id: promo._id.toString(),
      code: promo.code,
      percentOff: promo.percentOff || undefined,
      amountOffDT: promo.amountOffDT || undefined,
      appliesToType: promo.appliesToType || undefined,
      appliesToId: promo.appliesToId || undefined,
      creatorId: promo.creatorId?.toString() || undefined,
      communityId: promo.communityId || undefined,
      startsAt: promo.startsAt || undefined,
      endsAt: promo.endsAt || undefined,
      maxRedemptions: promo.maxRedemptions || undefined,
      redemptionsCount: promo.redemptionsCount || 0,
      isActive: promo.isActive,
      allowedEmails: promo.allowedEmails || [],
      createdAt: promo.createdAt,
      updatedAt: promo.updatedAt,
    };
  }
}

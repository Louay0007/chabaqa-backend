import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AffiliateConversion, AffiliateConversionDocument } from './schemas/affiliate-conversion.schema';
import { AffiliateClick, AffiliateClickDocument } from './schemas/affiliate-click.schema';
import { AffiliateLink, AffiliateLinkDocument } from './schemas/affiliate-link.schema';
import { AffiliateProgram, AffiliateProgramDocument } from './schemas/affiliate-program.schema';
import { AffiliatePartner, AffiliatePartnerDocument } from './schemas/affiliate-partner.schema';
import { Order, OrderDocument } from '../schema/order.schema';

@Injectable()
export class AffiliateCommissionService {
  private readonly logger = new Logger(AffiliateCommissionService.name);

  constructor(
    @InjectModel(AffiliateConversion.name) private readonly conversionModel: Model<AffiliateConversionDocument>,
    @InjectModel(AffiliateClick.name) private readonly clickModel: Model<AffiliateClickDocument>,
    @InjectModel(AffiliateLink.name) private readonly linkModel: Model<AffiliateLinkDocument>,
    @InjectModel(AffiliateProgram.name) private readonly programModel: Model<AffiliateProgramDocument>,
    @InjectModel(AffiliatePartner.name) private readonly partnerModel: Model<AffiliatePartnerDocument>,
    @InjectModel('Order') private readonly orderModel: Model<OrderDocument>,
  ) {}

  /**
   * Called after PaymentFulfillmentService.markCompleted() succeeds.
   * Creates a commission ledger entry (AffiliateConversion) if the order
   * has valid affiliate attribution.
   */
  async onOrderPaid(order: OrderDocument | any): Promise<AffiliateConversionDocument | null> {
    try {
      if (!order || order.status !== 'paid') return null;

      const clickId = order.metadata?.affiliateClickId;
      if (!clickId) return null;

      // Idempotency: prevent double conversion
      const existing = await this.conversionModel.findOne({ orderId: order._id });
      if (existing) {
        this.logger.warn(`Conversion already exists for order ${order._id}`);
        return existing;
      }

      // Load click
      const click = await this.clickModel.findOne({ clickId });
      if (!click) {
        this.logger.warn(`Affiliate click ${clickId} not found for order ${order._id}`);
        return null;
      }

      // Load link
      const link = await this.linkModel.findOne({ code: click.linkCode });
      if (!link) {
        this.logger.warn(`Affiliate link not found for click ${clickId}`);
        return null;
      }

      // Load program
      const program = await this.programModel.findById(link.programId);
      if (!program || program.status !== 'active') {
        this.logger.warn(`Program not active for click ${clickId}`);
        return null;
      }

      // Load partner
      const partner = await this.partnerModel.findOne({
        programId: program._id,
        partnerUserId: link.partnerUserId,
        status: 'approved',
      });
      if (!partner) {
        this.logger.warn(`Partner not approved for click ${clickId}`);
        return null;
      }

      // Self-referral check
      const buyerId = order.buyerId.toString();
      const partnerUserId = partner.partnerUserId.toString();
      if (buyerId === partnerUserId) {
        this.logger.warn(`Self-referral blocked: buyer ${buyerId} === partner ${partnerUserId}`);
        return null;
      }

      // Cookie window check
      const clickAge = Date.now() - new Date((click as any).createdAt).getTime();
      const windowMs = program.cookieWindowDays * 24 * 60 * 60 * 1000;
      if (clickAge > windowMs) {
        this.logger.warn(`Click ${clickId} expired (age: ${Math.round(clickAge / 86400000)}d, window: ${program.cookieWindowDays}d)`);
        return null;
      }

      // Compute commission from creatorNetDT
      const creatorNetDT = order.creatorNetDT || 0;
      const commissionDT = Math.round(creatorNetDT * program.commissionPercent) / 100;

      if (commissionDT <= 0) {
        this.logger.warn(`Commission is 0 for order ${order._id}`);
        return null;
      }

      const holdDays = program.holdDays || Number(process.env.AFFILIATE_DEFAULT_HOLD_DAYS || 14);
      const holdUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);

      const conversion = await this.conversionModel.create({
        orderId: order._id,
        programId: program._id,
        partnerUserId: partner.partnerUserId,
        buyerId: order.buyerId,
        creatorId: order.creatorId,
        communityId: order.communityId,
        contentType: order.contentType,
        contentId: order.contentId,
        amountDT: order.amountDT,
        creatorNetDT,
        commissionDT,
        status: 'pending',
        holdUntil,
      });

      this.logger.log(
        `Created conversion ${conversion._id} for order ${order._id}: ` +
        `commission=${commissionDT} DT (${program.commissionPercent}% of ${creatorNetDT})`,
      );

      return conversion;
    } catch (error: any) {
      // Handle duplicate key error (idempotency safety)
      if (error?.code === 11000) {
        this.logger.warn(`Duplicate conversion attempt for order ${order?._id}`);
        return this.conversionModel.findOne({ orderId: order._id });
      }
      this.logger.error(`Error creating conversion for order ${order?._id}: ${error?.message}`);
      return null;
    }
  }

  /**
   * Reverse a conversion when an order is refunded.
   */
  async onOrderRefunded(orderId: string): Promise<AffiliateConversionDocument | null> {
    const conversion = await this.conversionModel.findOne({
      orderId: new Types.ObjectId(orderId),
      status: { $in: ['pending', 'approved'] },
    });
    if (!conversion) return null;

    conversion.status = 'reversed';
    conversion.reason = 'order_refunded';
    await conversion.save();

    this.logger.log(`Reversed conversion ${conversion._id} for refunded order ${orderId}`);
    return conversion;
  }

  /**
   * Daily cron: approve pending conversions whose hold period has elapsed.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async approvePendingConversions(): Promise<void> {
    const now = new Date();
    const pendingConversions = await this.conversionModel.find({
      status: 'pending',
      holdUntil: { $lte: now },
    });

    for (const conversion of pendingConversions) {
      // Verify order is still paid (not refunded)
      const order = await this.orderModel.findById(conversion.orderId).select('status');
      if (!order || order.status === 'refunded' || order.status === 'cancelled') {
        conversion.status = 'reversed';
        conversion.reason = `order_${order?.status || 'missing'}`;
        await conversion.save();
        this.logger.log(`Reversed conversion ${conversion._id}: order ${conversion.orderId} is ${order?.status || 'missing'}`);
        continue;
      }

      conversion.status = 'approved';
      await conversion.save();
      this.logger.log(`Approved conversion ${conversion._id} (hold period elapsed)`);
    }

    if (pendingConversions.length > 0) {
      this.logger.log(`Processed ${pendingConversions.length} pending conversions`);
    }
  }
}

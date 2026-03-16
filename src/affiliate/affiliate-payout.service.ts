import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { AffiliatePayoutRequest, AffiliatePayoutRequestDocument } from './schemas/affiliate-payout-request.schema';
import { AffiliateConversion, AffiliateConversionDocument } from './schemas/affiliate-conversion.schema';

@Injectable()
export class AffiliatePayoutService {
  private readonly logger = new Logger(AffiliatePayoutService.name);

  constructor(
    @InjectModel(AffiliatePayoutRequest.name) private readonly payoutModel: Model<AffiliatePayoutRequestDocument>,
    @InjectModel(AffiliateConversion.name) private readonly conversionModel: Model<AffiliateConversionDocument>,
  ) {}

  /**
   * Compute the affiliate's balance breakdown.
   */
  async getBalance(partnerUserId: string): Promise<{
    approvedBalanceDT: number;
    pendingDT: number;
    paidDT: number;
    reversedDT: number;
  }> {
    const uid = new Types.ObjectId(partnerUserId);

    const [conversions, payoutsPaid] = await Promise.all([
      this.conversionModel.aggregate([
        { $match: { partnerUserId: uid } },
        { $group: { _id: '$status', total: { $sum: '$commissionDT' } } },
      ]),
      this.payoutModel.aggregate([
        { $match: { partnerUserId: uid, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountDT' } } },
      ]),
    ]);

    const byStatus: Record<string, number> = {};
    for (const c of conversions) {
      byStatus[c._id] = c.total;
    }

    const approvedTotal = byStatus['approved'] || 0;
    const paidConversions = byStatus['paid'] || 0;
    const pendingDT = byStatus['pending'] || 0;
    const reversedDT = byStatus['reversed'] || 0;
    const totalPaidOut = payoutsPaid[0]?.total || 0;

    // Pending payouts that haven't been paid yet reduce available balance
    const pendingPayouts = await this.payoutModel.aggregate([
      { $match: { partnerUserId: uid, status: { $in: ['pending', 'approved'] } } },
      { $group: { _id: null, total: { $sum: '$amountDT' } } },
    ]);
    const pendingPayoutAmount = pendingPayouts[0]?.total || 0;

    // Available = approved conversions - already paid out - pending payouts
    const approvedBalanceDT = Math.max(0, approvedTotal + paidConversions - totalPaidOut - pendingPayoutAmount);

    return {
      approvedBalanceDT,
      pendingDT,
      paidDT: totalPaidOut,
      reversedDT,
    };
  }

  /**
   * Partner requests a payout.
   */
  async requestPayout(
    partnerUserId: string,
    amountDT: number,
    method: 'bank_transfer' | 'paypal' | 'stripe',
    metadata?: Record<string, any>,
  ): Promise<AffiliatePayoutRequestDocument> {
    const minPayout = Number(process.env.AFFILIATE_MIN_PAYOUT_DT || 50);
    if (amountDT < minPayout) {
      throw new BadRequestException(`Minimum payout is ${minPayout} DT`);
    }

    const balance = await this.getBalance(partnerUserId);
    if (amountDT > balance.approvedBalanceDT) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${balance.approvedBalanceDT} DT, requested: ${amountDT} DT`,
      );
    }

    const reference = `AFF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    return this.payoutModel.create({
      partnerUserId: new Types.ObjectId(partnerUserId),
      amountDT,
      currency: 'TND',
      method,
      status: 'pending',
      reference,
      metadata: metadata || {},
      requestedAt: new Date(),
    });
  }

  /**
   * Get payout history for a partner.
   */
  async getPartnerPayouts(partnerUserId: string): Promise<AffiliatePayoutRequestDocument[]> {
    return this.payoutModel
      .find({ partnerUserId: new Types.ObjectId(partnerUserId) })
      .sort({ createdAt: -1 });
  }

  // ── Admin endpoints ──

  async getPayouts(status?: string): Promise<AffiliatePayoutRequestDocument[]> {
    const filter: any = {};
    if (status) filter.status = status;
    return this.payoutModel.find(filter).sort({ createdAt: -1 }).populate('partnerUserId', 'name email');
  }

  async approvePayout(payoutId: string, adminNotes?: string): Promise<AffiliatePayoutRequestDocument> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'pending') throw new BadRequestException(`Cannot approve payout with status ${payout.status}`);

    payout.status = 'approved';
    payout.adminNotes = adminNotes || payout.adminNotes;
    return payout.save();
  }

  async markPayoutPaid(payoutId: string, adminNotes?: string): Promise<AffiliatePayoutRequestDocument> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'approved') throw new BadRequestException(`Cannot mark as paid: status is ${payout.status}`);

    // Mark enough approved conversions as paid (FIFO)
    let remaining = payout.amountDT;
    const conversions = await this.conversionModel
      .find({
        partnerUserId: payout.partnerUserId,
        status: 'approved',
      })
      .sort({ createdAt: 1 });

    for (const conversion of conversions) {
      if (remaining <= 0) break;
      conversion.status = 'paid';
      await conversion.save();
      remaining -= conversion.commissionDT;
    }

    payout.status = 'paid';
    payout.processedAt = new Date();
    payout.adminNotes = adminNotes || payout.adminNotes;
    return payout.save();
  }
}

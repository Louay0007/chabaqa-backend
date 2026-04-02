import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../../schema/subscription.schema';
import { Plan, PlanDocument } from '../../schema/plan.schema';

export interface FeeBreakdown {
  amountDT: number;
  platformPercent: number;
  platformFixedDT: number;
  platformFeeDT: number;
  creatorNetDT: number;
}

/**
 * FeeService - Calculates platform fees and creator net amounts
 * 
 * IMPORTANT: Fees are DEDUCTED from the payment amount, NOT added on top.
 * 
 * Example: If a user pays 50 DT with 7.9% fee:
 *   - User pays: 50 DT (exactly what they see)
 *   - Platform fee: 50 * 0.079 = 3.95 DT
 *   - Creator receives: 50 - 3.95 = 46.05 DT
 * 
 * The user NEVER pays more than the displayed price.
 */
@Injectable()
export class FeeService {
  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  /**
   * Calculate fee breakdown for a given amount
   * 
   * @param amountDT - The total amount the customer pays (in Tunisian Dinars)
   * @param creatorId - The creator's ID to determine their plan tier and fee rate
   * @returns FeeBreakdown with platform fee deducted from the amount
   * 
   * Formula:
   *   platformFeeDT = (amountDT × platformPercent / 100) + platformFixedDT
   *   creatorNetDT = amountDT - platformFeeDT
   * 
   * This ensures the customer pays EXACTLY amountDT, and the creator receives
   * amountDT minus the platform fee. The fee is absorbed by the creator, not
   * added to the customer's payment.
   */
  async calculateForAmount(amountDT: number, creatorId: string | Types.ObjectId): Promise<FeeBreakdown> {
    if (amountDT <= 0) {
      throw new BadRequestException('Montant invalide');
    }

    // Get creator's subscription to determine fee rate
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    
    // Default fees for creators without a subscription (highest rate)
    let percent = 9.0;
    let fixed = 0.5;

    if (sub) {
      const plan = await this.planModel.findOne({ tier: sub.plan });
      if (plan) {
        // Use plan-specific fees:
        // - Starter: 7.9%
        // - Growth: 4.9%
        // - Pro: 2.9%
        percent = plan.transactionFeePercent;
        fixed = plan.transactionFixedFeeDT;
      }
    }

    // Calculate platform fee (percentage + fixed)
    const platformFeeDT = Math.round((amountDT * (percent / 100) + fixed) * 100) / 100;
    
    // Creator receives the amount MINUS the platform fee
    // This ensures the customer pays exactly amountDT
    const creatorNetDT = Math.max(0, Math.round((amountDT - platformFeeDT) * 100) / 100);

    return {
      amountDT,           // What the customer pays
      platformPercent: percent,
      platformFixedDT: fixed,
      platformFeeDT,      // What the platform takes
      creatorNetDT,       // What the creator receives (amountDT - platformFeeDT)
    };
  }
}



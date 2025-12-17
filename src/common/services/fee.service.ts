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

@Injectable()
export class FeeService {
  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  async calculateForAmount(amountDT: number, creatorId: string | Types.ObjectId): Promise<FeeBreakdown> {
    if (amountDT <= 0) {
      throw new BadRequestException('Montant invalide');
    }

    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    let percent = 9.0;
    let fixed = 0.5;

    if (sub) {
      const plan = await this.planModel.findOne({ tier: sub.plan });
      if (plan) {
        percent = plan.transactionFeePercent;
        fixed = plan.transactionFixedFeeDT;
      }
    }

    const platformFeeDT = Math.round((amountDT * (percent / 100) + fixed) * 100) / 100;
    const creatorNetDT = Math.max(0, Math.round((amountDT - platformFeeDT) * 100) / 100);

    return {
      amountDT,
      platformPercent: percent,
      platformFixedDT: fixed,
      platformFeeDT,
      creatorNetDT,
    };
  }
}



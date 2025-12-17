import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PromoCode, PromoCodeDocument } from '../../schema/promo-code.schema';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export interface PromoApplyResult {
  valid: boolean;
  reason?: string;
  originalAmountDT: number;
  discountDT: number;
  finalAmountDT: number;
  appliedCode?: string;
}

@Injectable()
export class PromoService {
  constructor(@InjectModel(PromoCode.name) private promoModel: Model<PromoCodeDocument>) {}

  async validateAndApply(
    code: string | undefined,
    amountDT: number,
    contentType: TrackableContentType,
    contentId: string,
    buyerEmail?: string
  ): Promise<PromoApplyResult> {
    if (!code) {
      return { valid: false, originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }

    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() });
    if (!promo) {
      return { valid: false, reason: 'Code invalide', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }

    const now = new Date();
    if (!promo.isActive) {
      return { valid: false, reason: 'Code inactif', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }
    if (promo.startsAt && now < promo.startsAt) {
      return { valid: false, reason: 'Code non encore actif', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }
    if (promo.endsAt && now > promo.endsAt) {
      return { valid: false, reason: 'Code expiré', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }
    if (promo.maxRedemptions && promo.redemptionsCount >= promo.maxRedemptions) {
      return { valid: false, reason: 'Limite d\'utilisations atteinte', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }
    if (promo.allowedEmails && promo.allowedEmails.length && buyerEmail) {
      const allowed = promo.allowedEmails.map(e => e.toLowerCase());
      if (!allowed.includes(buyerEmail.toLowerCase())) {
        return { valid: false, reason: 'Code non applicable à cet utilisateur', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
      }
    }
    if (promo.appliesToType && promo.appliesToType !== contentType) {
      return { valid: false, reason: 'Code non applicable à ce type', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }
    if (promo.appliesToId && promo.appliesToId !== contentId) {
      return { valid: false, reason: 'Code non applicable à cet élément', originalAmountDT: amountDT, discountDT: 0, finalAmountDT: amountDT };
    }

    let discountDT = 0;
    if (promo.percentOff && promo.percentOff > 0) {
      discountDT += (amountDT * promo.percentOff) / 100;
    }
    if (promo.amountOffDT && promo.amountOffDT > 0) {
      discountDT += promo.amountOffDT;
    }
    const finalAmountDT = Math.max(0, amountDT - discountDT);

    return {
      valid: true,
      appliedCode: promo.code,
      originalAmountDT: amountDT,
      discountDT,
      finalAmountDT,
    };
  }
}



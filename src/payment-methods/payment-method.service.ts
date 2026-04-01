import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentMethod, PaymentMethodDocument } from '../schema/payment-method.schema';
import { Subscription, SubscriptionDocument } from '../schema/subscription.schema';

@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);
  private stripe: Stripe | null = null;

  constructor(
    @InjectModel(PaymentMethod.name) private pmModel: Model<PaymentMethodDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not configured — payment methods will use mock mode');
    }
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
    }
    return this.stripe;
  }

  /**
   * Create a Stripe SetupIntent for the creator.
   * Frontend uses the clientSecret to collect card details via Stripe Elements.
   */
  async createSetupIntent(creatorId: string) {
    const stripe = this.ensureStripe();
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId) }).lean();

    let customerId = sub?.providerCustomerId;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        metadata: { creatorId },
      });
      customerId = customer.id;

      // Save customer ID to subscription
      if (sub) {
        await this.subModel.updateOne(
          { creatorId: new Types.ObjectId(creatorId) },
          { provider: 'stripe', providerCustomerId: customerId },
        );
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return {
      clientSecret: setupIntent.client_secret,
      customerId,
      setupIntentId: setupIntent.id,
    };
  }

  /**
   * After SetupIntent completes on frontend, confirm and save the payment method.
   */
  async confirmPaymentMethod(creatorId: string, setupIntentId: string) {
    const stripe = this.ensureStripe();

    const si = await stripe.setupIntents.retrieve(setupIntentId);
    if (si.status !== 'succeeded') {
      throw new BadRequestException(`SetupIntent status is ${si.status}, expected succeeded`);
    }

    const pm = await stripe.paymentMethods.retrieve(si.payment_method as string);

    // Unset previous default
    await this.pmModel.updateMany(
      { creatorId: new Types.ObjectId(creatorId) },
      { isDefault: false },
    );

    // Save new payment method
    const saved = await this.pmModel.create({
      creatorId: new Types.ObjectId(creatorId),
      provider: 'stripe',
      providerCustomerId: si.customer as string,
      providerPaymentMethodId: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: true,
    });

    // Update subscription with payment info
    await this.subModel.updateOne(
      { creatorId: new Types.ObjectId(creatorId) },
      {
        hasPaymentMethod: true,
        defaultPaymentMethodId: saved._id,
        provider: 'stripe',
        providerCustomerId: si.customer as string,
        paymentBrand: pm.card?.brand?.toUpperCase(),
        paymentLast4: pm.card?.last4,
      },
    );

    return {
      success: true,
      card: {
        id: saved._id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      },
    };
  }

  /**
   * List all saved payment methods for a creator.
   */
  async listPaymentMethods(creatorId: string) {
    const methods = await this.pmModel
      .find({ creatorId: new Types.ObjectId(creatorId) })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    return methods.map((m) => ({
      id: m._id.toString(),
      provider: m.provider,
      brand: m.brand,
      last4: m.last4,
      expMonth: m.expMonth,
      expYear: m.expYear,
      isDefault: m.isDefault,
    }));
  }

  /**
   * Set a payment method as default.
   */
  async setDefault(creatorId: string, pmId: string) {
    const pm = await this.pmModel.findById(pmId).lean();
    if (!pm) throw new NotFoundException('Payment method not found');
    if (pm.creatorId.toString() !== creatorId) throw new ForbiddenException('Not your payment method');

    await this.pmModel.updateMany(
      { creatorId: new Types.ObjectId(creatorId) },
      { isDefault: false },
    );
    await this.pmModel.updateOne({ _id: new Types.ObjectId(pmId) }, { isDefault: true });

    // Update subscription
    await this.subModel.updateOne(
      { creatorId: new Types.ObjectId(creatorId) },
      {
        defaultPaymentMethodId: new Types.ObjectId(pmId),
        paymentBrand: pm.brand?.toUpperCase(),
        paymentLast4: pm.last4,
      },
    );

    return { success: true };
  }

  /**
   * Remove a saved payment method.
   */
  async remove(creatorId: string, pmId: string) {
    const pm = await this.pmModel.findById(pmId).lean();
    if (!pm) throw new NotFoundException('Payment method not found');
    if (pm.creatorId.toString() !== creatorId) throw new ForbiddenException('Not your payment method');

    // Detach from Stripe if possible
    if (this.stripe && pm.providerPaymentMethodId) {
      try {
        await this.stripe.paymentMethods.detach(pm.providerPaymentMethodId);
      } catch (err) {
        this.logger.warn(`Failed to detach PM from Stripe: ${err.message}`);
      }
    }

    await this.pmModel.deleteOne({ _id: new Types.ObjectId(pmId) });

    // If this was default, set another as default or clear
    if (pm.isDefault) {
      const next = await this.pmModel.findOne({ creatorId: new Types.ObjectId(creatorId) }).sort({ createdAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
        await this.subModel.updateOne(
          { creatorId: new Types.ObjectId(creatorId) },
          { defaultPaymentMethodId: next._id, paymentBrand: next.brand?.toUpperCase(), paymentLast4: next.last4 },
        );
      } else {
        await this.subModel.updateOne(
          { creatorId: new Types.ObjectId(creatorId) },
          { hasPaymentMethod: false, defaultPaymentMethodId: null, paymentBrand: null, paymentLast4: null },
        );
      }
    }

    return { success: true };
  }
}

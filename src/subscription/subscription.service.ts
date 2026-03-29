import { Injectable, BadRequestException, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../schema/subscription.schema';
import { Plan, PlanDocument, PlanTier } from '../schema/plan.schema';
import { 
  CreateSubscriptionDto, 
  UpdateSubscriptionDto, 
  GetSubscriptionsQueryDto, 
  SubscriptionResponseDto, 
  SubscriptionStatsDto, 
  SubscriptionPlanDto,
  WebhookEventDto,
  WebhookResponseDto,
  InvoiceDto,
  InvoiceListDto,
  CreateInvoiceDto,
  UsageTrackingDto,
  UsageSummaryDto,
  RecordUsageDto,
  UsageMetricType
} from '../dto-subscription';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  async startTrialForCreator(creatorId: string | Types.ObjectId) {
    try {
      const existing = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
      
      // Check for existing active or trial subscription
      if (existing && (existing.status === SubscriptionStatus.ACTIVE || existing.status === SubscriptionStatus.TRIALING)) {
        throw new ConflictException('Une souscription active existe déjà');
      }

      // Validate that a billing method is configured
      const needsBilling = existing && existing.hasPaymentMethod === true ? false : true;
      const hasBilling = existing?.hasPaymentMethod === true;
      if (!hasBilling) {
        throw new BadRequestException("Un moyen de paiement doit être configuré avant de démarrer l'essai gratuit");
      }

      // Get the starter plan
      const plan = await this.planModel.findOne({ tier: PlanTier.STARTER, isActive: true });
      if (!plan) {
        throw new NotFoundException('Plan STARTER introuvable');
      }

      const now = new Date();
      const trialDays = plan.trialDays || 7;
      const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

      const sub = await this.subModel.findOneAndUpdate(
        { creatorId: new Types.ObjectId(creatorId as any) },
        {
          $set: {
            plan: plan.tier,
            status: SubscriptionStatus.TRIALING,
            trialEndsAt: trialEnds,
            currentPeriodStart: now,
            currentPeriodEnd: trialEnds,
            cancelAtPeriodEnd: false,
            communitiesMax: plan.limits.communitiesMax,
            membersMax: plan.limits.membersMax,
            coursesActivationMax: plan.limits.coursesActivationMax,
            storageGB: plan.limits.storageGB,
            adminsMax: plan.limits.adminsMax,
          },
        },
        { upsert: true, new: true },
      );

      this.logger.log(`Trial started for creator ${creatorId}, trial ends at ${trialEnds}`);

      return {
        message: 'Essai gratuit démarré avec succès',
        subscription: sub,
        trialEndsAt: trialEnds,
        trialDays,
      };
    } catch (error) {
      this.logger.error(`Failed to start trial for creator ${creatorId}:`, error.message);
      throw error;
    }
  }

  async setupBillingMethod(
    creatorId: string | Types.ObjectId, 
    body: { 
      providerCustomerId: string; 
      paymentBrand?: string; 
      paymentLast4?: string; 
      provider?: string;
    }
  ) {
    try {
      if (!body?.providerCustomerId) {
        throw new BadRequestException('providerCustomerId requis');
      }

      // Validate provider
      const validProviders = ['stripe', 'paypal', 'custom'];
      const provider = body.provider || 'custom';
      if (!validProviders.includes(provider)) {
        throw new BadRequestException(`Provider non supporté. Providers valides: ${validProviders.join(', ')}`);
      }

      // Validate payment brand if provided
      if (body.paymentBrand) {
        const validBrands = ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay'];
        if (!validBrands.includes(body.paymentBrand.toLowerCase())) {
          throw new BadRequestException(`Type de carte non supporté: ${body.paymentBrand}`);
        }
      }

      // Validate last 4 digits
      if (body.paymentLast4 && !/^\d{4}$/.test(body.paymentLast4)) {
        throw new BadRequestException('Les 4 derniers chiffres doivent être exactement 4 chiffres');
      }

      const sub = await this.subModel.findOneAndUpdate(
        { creatorId: new Types.ObjectId(creatorId as any) },
        {
          $set: {
            provider,
            providerCustomerId: body.providerCustomerId,
            hasPaymentMethod: true,
            paymentBrand: body.paymentBrand?.toLowerCase(),
            paymentLast4: body.paymentLast4,
          },
        },
        { upsert: true, new: true },
      );

      this.logger.log(`Billing method setup for creator ${creatorId} with provider ${provider}`);

      return { 
        message: 'Moyen de paiement enregistré avec succès', 
        subscription: sub,
        provider,
        maskedCard: body.paymentBrand && body.paymentLast4 ? `**** **** **** ${body.paymentLast4}` : undefined
      };
    } catch (error) {
      this.logger.error(`Failed to setup billing for creator ${creatorId}:`, error.message);
      throw error;
    }
  }

  // Called by cron or before guarded actions to auto-activate expired trials
  async ensureActiveOrTrial(creatorId: string | Types.ObjectId) {
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    if (!sub) return null;
    const now = new Date();
    if (sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime()) {
      if (sub.hasPaymentMethod) {
        // Auto-activate to STARTER (stub billing capture; in real flow, create provider sub)
        sub.status = SubscriptionStatus.ACTIVE;
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await sub.save();
      } else {
        // Trial ended without billing: remain not active; policy will block activation
        return sub;
      }
    }
    return sub;
  }

  async upgradePlan(creatorId: string | Types.ObjectId, tier: PlanTier, session: any = null) {
    const plan = await this.planModel.findOne({ tier, isActive: true }).session(session);
    if (!plan) {
      throw new BadRequestException('Plan introuvable ou inactif');
    }

    const now = new Date();
    // For simplicity, set current period to 30 days from now (until provider integration)
    const next = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sub = await this.subModel.findOneAndUpdate(
      { creatorId: new Types.ObjectId(creatorId as any) },
      {
        $set: {
          plan: plan.tier,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: next,
          cancelAtPeriodEnd: false,
          communitiesMax: plan.limits.communitiesMax,
          membersMax: plan.limits.membersMax,
          coursesActivationMax: plan.limits.coursesActivationMax,
          storageGB: plan.limits.storageGB,
          adminsMax: plan.limits.adminsMax,
        },
      },
      { upsert: true, new: true, session },
    );

    return { message: 'Plan mis à jour', subscription: sub };
  }

  async cancelAtPeriodEnd(creatorId: string | Types.ObjectId) {
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    if (!sub) {
      throw new BadRequestException('Aucune souscription trouvée');
    }
    sub.cancelAtPeriodEnd = true;
    await sub.save();
    return { message: 'La souscription sera annulée à la fin de la période', subscription: sub };
  }

  async getMySubscription(creatorId: string | Types.ObjectId) {
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    return sub || null;
  }

  async getTrialRemaining(creatorId: string | Types.ObjectId) {
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) });
    if (!sub) {
      return {
        isTrialing: false,
        expiresAt: null,
        remaining: { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 },
        message: 'No subscription found',
      };
    }

    const now = new Date();
    const expiresAt = sub.trialEndsAt || null;
    const isTrialing = sub.status === SubscriptionStatus.TRIALING && !!expiresAt && expiresAt.getTime() > now.getTime();

    if (!isTrialing) {
      return {
        isTrialing: false,
        expiresAt,
        remaining: { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 },
        message: 'Not in trial',
      };
    }

    const diffMs = expiresAt!.getTime() - now.getTime();
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      isTrialing: true,
      expiresAt,
      remaining: { days, hours, minutes, seconds, totalMs: diffMs },
      message: 'Trial active',
    };
  }

  // New methods for comprehensive subscription management

  async getSubscriptionStats(creatorId: string | Types.ObjectId): Promise<SubscriptionStatsDto> {
    const stats = await this.subModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(creatorId as any)
        }
      },
      {
        $group: {
          _id: null,
          totalSubscribers: { $sum: 1 },
          activeSubscribers: {
            $sum: {
              $cond: [{ $eq: ['$status', SubscriptionStatus.ACTIVE] }, 1, 0]
            }
          },
          trialSubscribers: {
            $sum: {
              $cond: [{ $eq: ['$status', SubscriptionStatus.TRIALING] }, 1, 0]
            }
          },
          canceledSubscribers: {
            $sum: {
              $cond: [{ $eq: ['$status', SubscriptionStatus.CANCELED] }, 1, 0]
            }
          },
          pastDueSubscribers: {
            $sum: {
              $cond: [{ $eq: ['$status', SubscriptionStatus.PAST_DUE] }, 1, 0]
            }
          },
          revenueActiveTrial: {
            $sum: {
              $cond: [
                { $in: ['$status', [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE]] },
                '$amount',
                0
              ]
            }
          },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const result = stats[0] || {
      totalSubscribers: 0,
      activeSubscribers: 0,
      trialSubscribers: 0,
      canceledSubscribers: 0,
      pastDueSubscribers: 0,
      revenueActiveTrial: 0,
      totalAmount: 0
    };

    const activeOrTrialCount = result.activeSubscribers + result.trialSubscribers;
    const averageSubscriptionValue = activeOrTrialCount > 0
      ? result.revenueActiveTrial / activeOrTrialCount
      : 0;
    const monthlyRevenue = result.revenueActiveTrial;

    return {
      totalSubscribers: result.totalSubscribers,
      activeSubscribers: result.activeSubscribers,
      monthlyRevenue,
      averageSubscriptionValue,
      trialSubscribers: result.trialSubscribers,
      canceledSubscribers: result.canceledSubscribers,
      pastDueSubscribers: result.pastDueSubscribers
    };
  }

  async getAllSubscriptions(
    creatorId: string | Types.ObjectId,
    query: GetSubscriptionsQueryDto
  ): Promise<PaginatedResponseDto<SubscriptionResponseDto>> {
    const {
      status,
      plan,
      startDate,
      endDate,
      page = '1',
      limit = '20'
    } = query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;

    // Build filter
    const filter: any = {};
    if (creatorId) filter.creatorId = new Types.ObjectId(creatorId as any);
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (pageNum - 1) * limitNum;

    // Execute queries
    const [subscriptions, total] = await Promise.all([
      this.subModel
        .find(filter)
        .populate('creatorId', 'name email')
        .populate('subscriberId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      this.subModel.countDocuments(filter)
    ]);

    // Transform to response DTOs
    const subscriptionDtos: SubscriptionResponseDto[] = subscriptions.map(sub => {
      const subscriberPopulated = (sub as any).subscriberId;
      const subscriberEmail = subscriberPopulated?.email;
      return {
        id: sub._id.toString(),
        creatorId: sub.creatorId.toString(),
        subscriberId: sub.subscriberId?.toString?.() || '',
        subscriberEmail,
        plan: sub.plan,
        provider: sub.provider || '',
        providerCustomerId: sub.providerCustomerId || undefined,
        providerSubscriptionId: sub.providerSubscriptionId || undefined,
        trialEndsAt: sub.trialEndsAt || undefined,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        nextBillingAt: sub.nextBillingAt,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        amount: sub.amount ?? 0,
        currency: sub.currency || 'TND',
        communitiesMax: sub.communitiesMax,
        membersMax: sub.membersMax,
        coursesActivationMax: sub.coursesActivationMax,
        storageGB: sub.storageGB,
        adminsMax: sub.adminsMax,
        hasPaymentMethod: sub.hasPaymentMethod,
        paymentBrand: sub.paymentBrand || undefined,
        paymentLast4: sub.paymentLast4 || undefined,
        createdAt: (sub as any).createdAt,
        updatedAt: (sub as any).updatedAt
      };
    });

    return new PaginatedResponseDto(subscriptionDtos, total, pageNum, limitNum);
  }

  async createPlan(createPlanDto: CreateSubscriptionDto): Promise<SubscriptionPlanDto> {
    const plan = await this.planModel.create({
      tier: createPlanDto.plan,
      name: `${createPlanDto.plan.charAt(0).toUpperCase() + createPlanDto.plan.slice(1)} Plan`,
      priceDTPerMonth: createPlanDto.amount,
      trialDays: 7, // Default trial days
      limits: {
        communitiesMax: 1,
        membersMax: 100,
        coursesActivationMax: 3,
        storageGB: 2,
        adminsMax: 0
      },
      features: {
        courses: true,
        challenges: false,
        sessions: false,
        products: true,
        events: false,
        automationQuota: 0,
        branding: false,
        gamification: false,
        verifiedBadge: false,
        featuredBadge: false
      },
      transactionFeePercent: 2.9,
      transactionFixedFeeDT: 0.3,
      isActive: true
    });

    return {
      tier: plan.tier,
      name: plan.name,
      priceDTPerMonth: plan.priceDTPerMonth,
      trialDays: plan.trialDays,
      limits: plan.limits,
      features: plan.features,
      transactionFeePercent: plan.transactionFeePercent,
      transactionFixedFeeDT: plan.transactionFixedFeeDT,
      isActive: plan.isActive
    };
  }

  async getPlans(): Promise<SubscriptionPlanDto[]> {
    const plans = await this.planModel.find({ isActive: true }).exec();

    return plans.map(plan => ({
      tier: plan.tier,
      name: plan.name,
      priceDTPerMonth: plan.priceDTPerMonth,
      trialDays: plan.trialDays,
      limits: plan.limits,
      features: plan.features,
      transactionFeePercent: plan.transactionFeePercent,
      transactionFixedFeeDT: plan.transactionFixedFeeDT,
      isActive: plan.isActive
    }));
  }

  async getPlanByTier(tier: PlanTier): Promise<SubscriptionPlanDto> {
    const plan = await this.planModel.findOne({ tier, isActive: true }).exec();
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return {
      tier: plan.tier,
      name: plan.name,
      priceDTPerMonth: plan.priceDTPerMonth,
      trialDays: plan.trialDays,
      limits: plan.limits,
      features: plan.features,
      transactionFeePercent: plan.transactionFeePercent,
      transactionFixedFeeDT: plan.transactionFixedFeeDT,
      isActive: plan.isActive
    };
  }

  async updatePlan(tier: PlanTier, updatePlanDto: UpdateSubscriptionDto): Promise<SubscriptionPlanDto> {
    const plan = await this.planModel.findOne({ tier }).exec();
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Update fields
    if (updatePlanDto.amount) plan.priceDTPerMonth = updatePlanDto.amount;
    if (updatePlanDto.communitiesMax !== undefined) plan.limits.communitiesMax = updatePlanDto.communitiesMax;
    if (updatePlanDto.membersMax !== undefined) plan.limits.membersMax = updatePlanDto.membersMax;
    if (updatePlanDto.coursesActivationMax !== undefined) plan.limits.coursesActivationMax = updatePlanDto.coursesActivationMax;
    if (updatePlanDto.storageGB !== undefined) plan.limits.storageGB = updatePlanDto.storageGB;
    if (updatePlanDto.adminsMax !== undefined) plan.limits.adminsMax = updatePlanDto.adminsMax;

    await plan.save();

    return {
      tier: plan.tier,
      name: plan.name,
      priceDTPerMonth: plan.priceDTPerMonth,
      trialDays: plan.trialDays,
      limits: plan.limits,
      features: plan.features,
      transactionFeePercent: plan.transactionFeePercent,
      transactionFixedFeeDT: plan.transactionFixedFeeDT,
      isActive: plan.isActive
    };
  }

  async deletePlan(tier: PlanTier): Promise<{ message: string }> {
    const plan = await this.planModel.findOne({ tier }).exec();
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    plan.isActive = false;
    await plan.save();

    return { message: 'Plan deactivated successfully' };
  }

  async exportSubscriptions(
    creatorId: string | Types.ObjectId,
    filters?: { status?: string; plan?: PlanTier; startDate?: string; endDate?: string }
  ): Promise<{ message: string; downloadUrl: string }> {
    // In a real implementation, this would generate a CSV file and return a download URL
    // For now, we'll just return a mock response
    return {
      message: 'Subscriptions exported successfully',
      downloadUrl: `/exports/subscriptions-${creatorId}-${Date.now()}.csv`
    };
  }

  async updateSubscription(subscriptionId: string, updateDto: UpdateSubscriptionDto): Promise<SubscriptionResponseDto> {
    const subscription = await this.subModel.findById(subscriptionId).exec();
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Update fields
    Object.assign(subscription, updateDto);
    await subscription.save();

    return {
      id: subscription._id.toString(),
      creatorId: subscription.creatorId.toString(),
      subscriberId: subscription.subscriberId?.toString?.() || '',
      // subscriberEmail populated only when query populates subscriberId; here we return undefined
      subscriberEmail: undefined,
      plan: subscription.plan,
      provider: subscription.provider || '',
      providerCustomerId: subscription.providerCustomerId || undefined,
      providerSubscriptionId: subscription.providerSubscriptionId || undefined,
      trialEndsAt: subscription.trialEndsAt || undefined,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextBillingAt: subscription.nextBillingAt,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      amount: subscription.amount ?? 0,
      currency: subscription.currency || 'TND',
      communitiesMax: subscription.communitiesMax,
      membersMax: subscription.membersMax,
      coursesActivationMax: subscription.coursesActivationMax,
      storageGB: subscription.storageGB,
      adminsMax: subscription.adminsMax,
      hasPaymentMethod: subscription.hasPaymentMethod,
      paymentBrand: subscription.paymentBrand || undefined,
      paymentLast4: subscription.paymentLast4 || undefined,
      createdAt: (subscription as any).createdAt,
      updatedAt: (subscription as any).updatedAt
    };
  }

  async deleteSubscription(subscriptionId: string): Promise<{ message: string }> {
    try {
      const subscription = await this.subModel.findById(subscriptionId).exec();
      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      // Only allow deletion of canceled subscriptions
      if (subscription.status !== SubscriptionStatus.CANCELED) {
        throw new BadRequestException('Only canceled subscriptions can be deleted. Cancel the subscription first.');
      }

      await this.subModel.deleteOne({ _id: subscriptionId }).exec();
      
      this.logger.log(`Subscription ${subscriptionId} deleted successfully`);
      return { message: 'Subscription deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete subscription ${subscriptionId}:`, error.message);
      throw error;
    }
  }

  // ============ NEW WEBHOOK FUNCTIONALITY ============

  async handleWebhook(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    try {
      this.logger.log(`Processing webhook event: ${webhookEvent.type} - ${webhookEvent.id}`);

      switch (webhookEvent.type) {
        case 'subscription.created':
          return await this.handleSubscriptionCreated(webhookEvent);
        case 'subscription.updated':
          return await this.handleSubscriptionUpdated(webhookEvent);
        case 'subscription.deleted':
          return await this.handleSubscriptionDeleted(webhookEvent);
        case 'invoice.payment_succeeded':
          return await this.handleInvoicePaymentSucceeded(webhookEvent);
        case 'invoice.payment_failed':
          return await this.handleInvoicePaymentFailed(webhookEvent);
        case 'customer.subscription.trial_will_end':
          return await this.handleTrialWillEnd(webhookEvent);
        case 'payment_method.attached':
          return await this.handlePaymentMethodAttached(webhookEvent);
        case 'payment_method.detached':
          return await this.handlePaymentMethodDetached(webhookEvent);
        default:
          this.logger.warn(`Unhandled webhook event type: ${webhookEvent.type}`);
          return {
            message: 'Event type not handled',
            eventId: webhookEvent.id,
            status: 'skipped'
          };
      }
    } catch (error) {
      this.logger.error(`Webhook processing failed for event ${webhookEvent.id}:`, error.message);
      return {
        message: 'Webhook processing failed',
        eventId: webhookEvent.id,
        status: 'error'
      };
    }
  }

  private async handleSubscriptionCreated(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    // Find subscription by provider subscription ID
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.id 
    });

    if (subscription) {
      subscription.status = data.status;
      subscription.currentPeriodStart = new Date(data.current_period_start * 1000);
      subscription.currentPeriodEnd = new Date(data.current_period_end * 1000);
      await subscription.save();
    }

    return {
      message: 'Subscription created event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handleSubscriptionUpdated(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.id 
    });

    if (subscription) {
      subscription.status = data.status;
      subscription.currentPeriodStart = new Date(data.current_period_start * 1000);
      subscription.currentPeriodEnd = new Date(data.current_period_end * 1000);
      subscription.cancelAtPeriodEnd = data.cancel_at_period_end || false;
      await subscription.save();
    }

    return {
      message: 'Subscription updated event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handleSubscriptionDeleted(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.id 
    });

    if (subscription) {
      subscription.status = SubscriptionStatus.CANCELED;
      await subscription.save();
    }

    return {
      message: 'Subscription deleted event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handleInvoicePaymentSucceeded(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.subscription 
    });

    if (subscription) {
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.hasPaymentMethod = true;
      // Update billing period from invoice data
      if (data.period_start) {
        subscription.currentPeriodStart = new Date(data.period_start * 1000);
      }
      if (data.period_end) {
        subscription.currentPeriodEnd = new Date(data.period_end * 1000);
      }
      if (data.amount_paid) {
        subscription.amount = data.amount_paid / 100;
      }
      await subscription.save();
      
      this.logger.log(`Payment succeeded for subscription ${subscription._id}, amount: ${data.amount_paid / 100}`);
    }

    return {
      message: 'Invoice payment succeeded event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handleInvoicePaymentFailed(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.subscription 
    });

    if (subscription) {
      subscription.status = SubscriptionStatus.PAST_DUE;
      await subscription.save();
      
      // Log failed payment
      this.logger.warn(`Payment failed for subscription ${subscription._id}, amount: ${data.amount_due / 100}`);
    }

    return {
      message: 'Invoice payment failed event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handleTrialWillEnd(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerSubscriptionId: data.id 
    });

    if (subscription) {
      // Send notification about trial ending (implement notification service)
      this.logger.log(`Trial will end soon for subscription ${subscription._id}`);
    }

    return {
      message: 'Trial will end event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handlePaymentMethodAttached(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    // Find subscription by customer ID
    const subscription = await this.subModel.findOne({ 
      providerCustomerId: data.customer 
    });

    if (subscription) {
      subscription.hasPaymentMethod = true;
      subscription.paymentBrand = data.card?.brand;
      subscription.paymentLast4 = data.card?.last4;
      await subscription.save();
    }

    return {
      message: 'Payment method attached event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  private async handlePaymentMethodDetached(webhookEvent: WebhookEventDto): Promise<WebhookResponseDto> {
    const data = webhookEvent.data.object;
    
    const subscription = await this.subModel.findOne({ 
      providerCustomerId: data.customer 
    });

    if (subscription) {
      // Check if this was the last payment method
      subscription.hasPaymentMethod = false;
      subscription.paymentBrand = undefined;
      subscription.paymentLast4 = undefined;
      await subscription.save();
    }

    return {
      message: 'Payment method detached event processed',
      eventId: webhookEvent.id,
      status: 'success'
    };
  }

  // ============ INVOICE MANAGEMENT ============

  async getInvoices(
    creatorId: string | Types.ObjectId,
    page: number = 1,
    limit: number = 20
  ): Promise<InvoiceListDto> {
    try {
      // This is a placeholder implementation
      // In a real app, you would fetch from your payment provider or invoice database
      
      const mockInvoices: any[] = [];
      
      return {
        invoices: mockInvoices,
        total: 0,
        page,
        limit
      };
    } catch (error) {
      this.logger.error(`Failed to get invoices for creator ${creatorId}:`, error.message);
      throw error;
    }
  }

  async getInvoiceById(invoiceId: string): Promise<InvoiceDto> {
    try {
      // This is a placeholder implementation
      // In a real app, you would fetch from your payment provider
      
      throw new NotFoundException('Invoice not found');
    } catch (error) {
      this.logger.error(`Failed to get invoice ${invoiceId}:`, error.message);
      throw error;
    }
  }

  async createInvoice(createInvoiceDto: CreateInvoiceDto): Promise<InvoiceDto> {
    try {
      // This is a placeholder implementation
      // In a real app, you would create an invoice via your payment provider
      
      throw new BadRequestException('Invoice creation not implemented');
    } catch (error) {
      this.logger.error('Failed to create invoice:', error.message);
      throw error;
    }
  }

  // ============ USAGE TRACKING ============

  async recordUsage(
    creatorId: string | Types.ObjectId,
    recordUsageDto: RecordUsageDto
  ): Promise<{ message: string }> {
    try {
      const subscription = await this.subModel.findOne({ 
        creatorId: new Types.ObjectId(creatorId as any) 
      });

      if (!subscription) {
        throw new NotFoundException('No active subscription found');
      }

      // Record the usage event
      const usageEvent: UsageTrackingDto = {
        metricType: recordUsageDto.metricType,
        value: recordUsageDto.value,
        customerId: creatorId.toString(),
        subscriptionId: subscription._id.toString(),
        resourceId: recordUsageDto.resourceId,
        timestamp: new Date().toISOString()
      };

      // In a real implementation, you would store this in a usage tracking collection
      this.logger.log(`Usage recorded: ${JSON.stringify(usageEvent)}`);

      // Check if usage exceeds plan limits
      await this.checkUsageLimits(subscription, recordUsageDto.metricType as UsageMetricType, recordUsageDto.value);

      return { message: 'Usage recorded successfully' };
    } catch (error) {
      this.logger.error(`Failed to record usage for creator ${creatorId}:`, error.message);
      throw error;
    }
  }

  async getUsageSummary(
    creatorId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageSummaryDto> {
    try {
      const subscription = await this.subModel.findOne({ 
        creatorId: new Types.ObjectId(creatorId as any) 
      });

      if (!subscription) {
        throw new NotFoundException('No subscription found');
      }

      const periodStart = startDate || subscription.currentPeriodStart;
      const periodEnd = endDate || subscription.currentPeriodEnd;

      // In a real implementation, you would aggregate usage data from a usage tracking collection
      // For now, return mock data
      const usageSummary: UsageSummaryDto = {
        customerId: creatorId.toString(),
        subscriptionId: subscription._id.toString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        communitiesCreated: 2,
        membersAdded: 45,
        coursesActivated: 5,
        storageUsedGB: 1.8,
        adminsAdded: 1,
        apiRequests: 1250,
        emailsSent: 150,
        automationsTriggered: 8,
        planLimits: {
          communitiesMax: subscription.communitiesMax,
          membersMax: subscription.membersMax,
          coursesActivationMax: subscription.coursesActivationMax,
          storageGB: subscription.storageGB,
          adminsMax: subscription.adminsMax
        },
        usagePercentages: {
          communities: (2 / subscription.communitiesMax) * 100,
          members: (45 / subscription.membersMax) * 100,
          courses: (5 / subscription.coursesActivationMax) * 100,
          storage: (1.8 / subscription.storageGB) * 100,
          admins: subscription.adminsMax > 0 ? (1 / subscription.adminsMax) * 100 : 0
        }
      };

      return usageSummary;
    } catch (error) {
      this.logger.error(`Failed to get usage summary for creator ${creatorId}:`, error.message);
      throw error;
    }
  }

  private async checkUsageLimits(
    subscription: SubscriptionDocument,
    metricType: UsageMetricType,
    newUsage: number
  ): Promise<void> {
    // This would check current usage + new usage against limits
    // For now, just log warnings when approaching limits
    
    const warningThreshold = 0.8; // 80%
    
    switch (metricType) {
      case UsageMetricType.COMMUNITIES_CREATED:
        if (newUsage >= subscription.communitiesMax * warningThreshold) {
          this.logger.warn(`Community usage approaching limit for subscription ${subscription._id}`);
        }
        break;
      case UsageMetricType.MEMBERS_ADDED:
        if (newUsage >= subscription.membersMax * warningThreshold) {
          this.logger.warn(`Member usage approaching limit for subscription ${subscription._id}`);
        }
        break;
      case UsageMetricType.STORAGE_USED:
        if (newUsage >= subscription.storageGB * warningThreshold) {
          this.logger.warn(`Storage usage approaching limit for subscription ${subscription._id}`);
        }
        break;
      default:
        break;
    }
  }
}



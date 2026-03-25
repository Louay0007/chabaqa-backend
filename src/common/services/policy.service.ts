import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../../schema/subscription.schema';
import { Plan, PlanDocument, PlanFeatures, PlanLimits } from '../../schema/plan.schema';

export interface EffectiveLimits {
  communitiesMax: number;
  membersMax: number;
  coursesActivationMax: number;
  storageGB: number;
  adminsMax: number;
  emailCampaignRecipientsPerMonth: number;
  whatsappMessagesPerMonth: number;
  analyticsLookbackDays: number;
  sessionBookingsPerMonth: number;
}

/** Returns true when plan enforcement is active (production mode). */
function isPlanEnforcementEnabled(): boolean {
  return process.env.PLAN_ENFORCEMENT_MODE === 'true';
}

/** Generous unlimited limits used when enforcement is OFF (dev / beta). */
const UNLIMITED_LIMITS: EffectiveLimits = {
  communitiesMax: 999,
  membersMax: 999999,
  coursesActivationMax: 9999,
  storageGB: 9999,
  adminsMax: 999,
  emailCampaignRecipientsPerMonth: 999999,
  whatsappMessagesPerMonth: 999999,
  analyticsLookbackDays: 365,
  sessionBookingsPerMonth: 999999,
};

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
  ) {}

  // ──────────────────────────────────────────────
  // Effective limits for a creator
  // ──────────────────────────────────────────────

  async getEffectiveLimitsForCreator(creatorId: Types.ObjectId | string): Promise<EffectiveLimits> {
    if (!isPlanEnforcementEnabled()) return UNLIMITED_LIMITS;

    const sub = await this.subModel
      .findOne({ creatorId: new Types.ObjectId(creatorId as any) })
      .lean();

    if (!sub) {
      // No subscription → most restrictive defaults (STARTER baseline)
      return {
        communitiesMax: 1,
        membersMax: 100,
        coursesActivationMax: 3,
        storageGB: 5,
        adminsMax: 1,
        emailCampaignRecipientsPerMonth: 0,
        whatsappMessagesPerMonth: 0,
        analyticsLookbackDays: 30,
        sessionBookingsPerMonth: 0,
      };
    }

    return {
      communitiesMax: sub.communitiesMax,
      membersMax: sub.membersMax,
      coursesActivationMax: sub.coursesActivationMax,
      storageGB: sub.storageGB,
      adminsMax: sub.adminsMax,
      emailCampaignRecipientsPerMonth: sub.emailCampaignRecipientsPerMonth ?? 0,
      whatsappMessagesPerMonth: sub.whatsappMessagesPerMonth ?? 0,
      analyticsLookbackDays: sub.analyticsLookbackDays ?? 30,
      sessionBookingsPerMonth: sub.sessionBookingsPerMonth ?? 0,
    };
  }

  // ──────────────────────────────────────────────
  // Active subscription check
  // ──────────────────────────────────────────────

  async hasActiveSubscription(creatorId: Types.ObjectId | string): Promise<boolean> {
    if (!isPlanEnforcementEnabled()) return true;

    const now = new Date();
    const sub = await this.subModel
      .findOne({ creatorId: new Types.ObjectId(creatorId as any) })
      .lean();
    if (!sub) return false;
    if (sub.status === 'active') return true;
    if (sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > now.getTime()) return true;
    return false;
  }

  // ──────────────────────────────────────────────
  // Feature-level gating (NEW)
  // ──────────────────────────────────────────────

  /**
   * Check whether the creator's plan includes a specific boolean feature.
   * Returns `true` when enforcement is OFF.
   */
  async canUseFeature(
    creatorId: Types.ObjectId | string,
    feature: keyof PlanFeatures,
  ): Promise<boolean> {
    if (!isPlanEnforcementEnabled()) return true;

    const plan = await this.getPlanForCreator(creatorId);
    if (!plan) return false;

    const value = plan.features[feature];
    return typeof value === 'boolean' ? value : (value as number) > 0;
  }

  /**
   * Load the Plan document for a creator (via their subscription tier).
   */
  async getPlanForCreator(creatorId: Types.ObjectId | string): Promise<Plan | null> {
    const sub = await this.subModel
      .findOne({ creatorId: new Types.ObjectId(creatorId as any) })
      .lean();
    if (!sub) return null;

    return this.planModel.findOne({ tier: sub.plan }).lean();
  }

  // ──────────────────────────────────────────────
  // Quota helpers (NEW)
  // ──────────────────────────────────────────────

  /**
   * Returns remaining automation/whatsapp quota for this billing period.
   * Returns a large number when enforcement is OFF.
   */
  async getRemainingQuota(
    creatorId: Types.ObjectId | string,
    quotaType: 'automation' | 'whatsapp' | 'emailCampaign' | 'sessionBookings',
    currentUsage: number,
  ): Promise<number> {
    if (!isPlanEnforcementEnabled()) return 999999;

    const limits = await this.getEffectiveLimitsForCreator(creatorId);

    let max: number;
    switch (quotaType) {
      case 'automation':
        const plan = await this.getPlanForCreator(creatorId);
        max = plan?.features?.automationQuota ?? 0;
        break;
      case 'whatsapp':
        max = limits.whatsappMessagesPerMonth;
        break;
      case 'emailCampaign':
        max = limits.emailCampaignRecipientsPerMonth;
        break;
      case 'sessionBookings':
        max = limits.sessionBookingsPerMonth;
        break;
      default:
        max = 0;
    }

    return Math.max(0, max - currentUsage);
  }

  /**
   * Get the analytics lookback days allowed for a creator.
   */
  async getAnalyticsLookbackDays(creatorId: Types.ObjectId | string): Promise<number> {
    if (!isPlanEnforcementEnabled()) return 365;

    const limits = await this.getEffectiveLimitsForCreator(creatorId);
    return limits.analyticsLookbackDays;
  }

  // ──────────────────────────────────────────────
  // Numeric limit checks (existing — unchanged API)
  // ──────────────────────────────────────────────

  async canActivateMoreCourses(creatorId: Types.ObjectId | string, currentActiveCount: number): Promise<boolean> {
    const limits = await this.getEffectiveLimitsForCreator(creatorId);
    return currentActiveCount < limits.coursesActivationMax;
  }

  async canCreateAnotherCommunity(creatorId: Types.ObjectId | string, currentCommunitiesCount: number): Promise<boolean> {
    const limits = await this.getEffectiveLimitsForCreator(creatorId);
    return currentCommunitiesCount < limits.communitiesMax;
  }

  async canAddMember(creatorId: Types.ObjectId | string, currentMembersCount: number): Promise<boolean> {
    const limits = await this.getEffectiveLimitsForCreator(creatorId);
    return currentMembersCount < limits.membersMax;
  }

  async canAddAdmin(creatorId: Types.ObjectId | string, currentAdminsCount: number): Promise<boolean> {
    const limits = await this.getEffectiveLimitsForCreator(creatorId);
    return currentAdminsCount < limits.adminsMax;
  }
}



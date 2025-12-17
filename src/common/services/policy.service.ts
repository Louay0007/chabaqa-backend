import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../../schema/subscription.schema';

export interface EffectiveLimits {
  communitiesMax: number;
  membersMax: number;
  coursesActivationMax: number;
  storageGB: number;
  adminsMax: number;
}

@Injectable()
export class PolicyService {
  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
  ) {}

  async getEffectiveLimitsForCreator(creatorId: Types.ObjectId | string): Promise<EffectiveLimits> {
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) }).lean();
    if (!sub) {
      // ⚠️ DEVELOPMENT ONLY: Generous limits for development (no subscription)
      // TODO: Revert to restrictive limits before production deployment
      // See DEVELOPMENT_CHANGES.md for production values
      return {
        communitiesMax: 10,  // PROD: 1
        membersMax: 1000,    // PROD: 100
        coursesActivationMax: 50,  // PROD: 3
        storageGB: 10,       // PROD: 2
        adminsMax: 5,        // PROD: 0
      };
    }
    return {
      communitiesMax: sub.communitiesMax,
      membersMax: sub.membersMax,
      coursesActivationMax: sub.coursesActivationMax,
      storageGB: sub.storageGB,
      adminsMax: sub.adminsMax,
    };
  }

  async hasActiveSubscription(creatorId: Types.ObjectId | string): Promise<boolean> {
    const now = new Date();
    const sub = await this.subModel.findOne({ creatorId: new Types.ObjectId(creatorId as any) }).lean();
    if (!sub) return false;
    if (sub.status === 'active') return true;
    if (sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > now.getTime()) return true;
    return false;
  }

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



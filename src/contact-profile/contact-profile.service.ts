import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContactProfile,
  ContactProfileDocument,
} from '../schema/contact-profile.schema';
import { ContactActivity, ContactActivityDocument } from '../schema/contact-activity.schema';

@Injectable()
export class ContactProfileService {
  constructor(
    @InjectModel(ContactProfile.name)
    private readonly profileModel: Model<ContactProfileDocument>,
    @InjectModel(ContactActivity.name)
    private readonly activityModel: Model<ContactActivityDocument>,
    @InjectModel('UserLoginActivity')
    private readonly loginActivityModel: Model<any>,
    @InjectModel('Order')
    private readonly orderModel: Model<any>,
  ) {}

  async upsert(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    patch: Partial<Pick<ContactProfile, 'tags' | 'notes' | 'customFields' | 'leadScore'>>,
  ): Promise<ContactProfileDocument> {
    const filter = {
      communityId: new Types.ObjectId(communityId.toString()),
      userId: new Types.ObjectId(userId.toString()),
    };
    return this.profileModel.findOneAndUpdate(filter, { $set: patch }, { upsert: true, new: true });
  }

  async addTag(communityId: string | Types.ObjectId, userId: string | Types.ObjectId, tag: string): Promise<void> {
    const filter = {
      communityId: new Types.ObjectId(communityId.toString()),
      userId: new Types.ObjectId(userId.toString()),
    };
    await this.profileModel.updateOne(filter, { $addToSet: { tags: tag } }, { upsert: true });
  }

  async removeTag(communityId: string | Types.ObjectId, userId: string | Types.ObjectId, tag: string): Promise<void> {
    const filter = {
      communityId: new Types.ObjectId(communityId.toString()),
      userId: new Types.ObjectId(userId.toString()),
    };
    await this.profileModel.updateOne(filter, { $pull: { tags: tag } });
  }

  async recalculateScore(communityId: string | Types.ObjectId, userId: string | Types.ObjectId): Promise<number> {
    const communityOid = new Types.ObjectId(communityId.toString());
    const userOid = new Types.ObjectId(userId.toString());
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [purchaseCount, emailOpens, loginActivity] = await Promise.all([
      this.orderModel.countDocuments({ buyerId: userOid, communityId: communityOid }),
      this.activityModel.countDocuments({
        communityId: communityOid,
        userId: userOid,
        type: 'email_open',
        occurredAt: { $gte: thirtyDaysAgo },
      }),
      this.loginActivityModel.findOne({ communityId: communityOid, userId: userOid }).lean() as Promise<any>,
    ]);

    const loginCount = loginActivity?.loginCount ?? 0;
    const joinedAt: Date | undefined = loginActivity?.joinedAt;

    let score = 0;
    score += Math.min(purchaseCount * 10, 40);
    score += Math.min(emailOpens * 5, 20);
    score += Math.min(loginCount * 5, 20);
    if (joinedAt && joinedAt >= sevenDaysAgo) score += 20;
    score = Math.max(0, Math.min(100, score));

    await this.profileModel.updateOne(
      { communityId: communityOid, userId: userOid },
      { $set: { leadScore: score } },
      { upsert: true },
    );
    return score;
  }

  async list(
    communityId: string | Types.ObjectId,
    { tags, minScore, maxScore, page = 1, limit = 20 }: {
      tags?: string[];
      minScore?: number;
      maxScore?: number;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const filter: Record<string, any> = { communityId: new Types.ObjectId(communityId.toString()) };
    if (tags && tags.length > 0) filter.tags = { $in: tags };
    if (minScore !== undefined || maxScore !== undefined) {
      filter.leadScore = {};
      if (minScore !== undefined) filter.leadScore.$gte = minScore;
      if (maxScore !== undefined) filter.leadScore.$lte = maxScore;
    }
    const [items, total] = await Promise.all([
      this.profileModel.find(filter).sort({ leadScore: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.profileModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async findOne(communityId: string | Types.ObjectId, userId: string | Types.ObjectId): Promise<ContactProfileDocument | null> {
    return this.profileModel.findOne({
      communityId: new Types.ObjectId(communityId.toString()),
      userId: new Types.ObjectId(userId.toString()),
    });
  }
}

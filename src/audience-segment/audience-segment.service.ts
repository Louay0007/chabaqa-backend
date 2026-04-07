import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AudienceSegment,
  AudienceSegmentDocument,
  SegmentFilter,
  SegmentFilterField,
  SegmentFilterOperator,
} from '../schema/audience-segment.schema';

function mongoOp(operator: SegmentFilterOperator): string {
  const map: Record<SegmentFilterOperator, string> = {
    gt: '$gt', lt: '$lt', eq: '$eq', gte: '$gte', lte: '$lte',
    contains: '$in', not_contains: '$nin',
  };
  return map[operator];
}

@Injectable()
export class AudienceSegmentService {
  constructor(
    @InjectModel(AudienceSegment.name)
    private readonly segmentModel: Model<AudienceSegmentDocument>,
    @InjectModel('UserLoginActivity')
    private readonly loginActivityModel: Model<any>,
    @InjectModel('Order')
    private readonly orderModel: Model<any>,
  ) {}

  async create(creatorId: string | Types.ObjectId, dto: {
    communityId: string;
    name: string;
    description?: string;
    filters: SegmentFilter[];
  }): Promise<AudienceSegmentDocument> {
    const segment = await this.segmentModel.create({
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId.toString()),
      name: dto.name,
      description: dto.description || '',
      filters: dto.filters,
    });
    return segment;
  }

  async evaluate(segmentId: string): Promise<Types.ObjectId[]> {
    const segment = await this.segmentModel.findById(segmentId).lean();
    if (!segment) throw new NotFoundException('Segment not found');

    const communityId = segment.communityId;
    // Start with all members of the community
    let loginActivities = await this.loginActivityModel
      .find({ communityId })
      .select('userId joinedAt lastLoginAt loginCount')
      .lean();

    const now = new Date();

    for (const filter of segment.filters) {
      loginActivities = await this.applyFilter(loginActivities, filter, communityId, now);
    }

    return loginActivities.map((la) => la.userId);
  }

  private async applyFilter(
    activities: any[],
    filter: SegmentFilter,
    communityId: Types.ObjectId,
    now: Date,
  ): Promise<any[]> {
    const op = mongoOp(filter.operator);

    switch (filter.field) {
      case SegmentFilterField.INACTIVITY_DAYS: {
        const threshold = new Date(now.getTime() - Number(filter.value) * 24 * 60 * 60 * 1000);
        return activities.filter((la) => {
          const lastLogin = la.lastLoginAt ? new Date(la.lastLoginAt) : null;
          if (filter.operator === SegmentFilterOperator.GT)
            return !lastLogin || lastLogin < threshold;
          if (filter.operator === SegmentFilterOperator.LT)
            return lastLogin && lastLogin > threshold;
          return true;
        });
      }
      case SegmentFilterField.JOINED_DAYS_AGO: {
        return activities.filter((la) => {
          if (!la.joinedAt) return false;
          const daysAgo = (now.getTime() - new Date(la.joinedAt).getTime()) / (24 * 60 * 60 * 1000);
          if (filter.operator === SegmentFilterOperator.GT) return daysAgo > Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LT) return daysAgo < Number(filter.value);
          if (filter.operator === SegmentFilterOperator.GTE) return daysAgo >= Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LTE) return daysAgo <= Number(filter.value);
          return true;
        });
      }
      case SegmentFilterField.LOGIN_COUNT: {
        return activities.filter((la) => {
          const count = la.loginCount || 0;
          if (filter.operator === SegmentFilterOperator.GT) return count > Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LT) return count < Number(filter.value);
          if (filter.operator === SegmentFilterOperator.GTE) return count >= Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LTE) return count <= Number(filter.value);
          if (filter.operator === SegmentFilterOperator.EQ) return count === Number(filter.value);
          return true;
        });
      }
      case SegmentFilterField.PURCHASE_COUNT: {
        const userIds = activities.map((la) => la.userId);
        const purchaseCounts = await this.orderModel.aggregate([
          { $match: { communityId, buyerId: { $in: userIds } } },
          { $group: { _id: '$buyerId', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(purchaseCounts.map((p: any) => [p._id.toString(), p.count]));
        return activities.filter((la) => {
          const count = countMap.get(la.userId.toString()) || 0;
          if (filter.operator === SegmentFilterOperator.GT) return count > Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LT) return count < Number(filter.value);
          if (filter.operator === SegmentFilterOperator.GTE) return count >= Number(filter.value);
          if (filter.operator === SegmentFilterOperator.LTE) return count <= Number(filter.value);
          if (filter.operator === SegmentFilterOperator.EQ) return count === Number(filter.value);
          return true;
        });
      }
      default:
        return activities;
    }
  }

  async refreshSize(segmentId: string): Promise<number> {
    const userIds = await this.evaluate(segmentId);
    await this.segmentModel.updateOne(
      { _id: segmentId },
      { $set: { estimatedSize: userIds.length, lastCalculatedAt: new Date() } },
    );
    return userIds.length;
  }

  async list(communityId: string | Types.ObjectId): Promise<AudienceSegmentDocument[]> {
    return this.segmentModel.find({ communityId: new Types.ObjectId(communityId.toString()) }).sort({ createdAt: -1 });
  }

  async delete(id: string): Promise<void> {
    await this.segmentModel.findByIdAndDelete(id);
  }
}

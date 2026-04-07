import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContactActivity,
  ContactActivityDocument,
  ContactActivityType,
} from '../schema/contact-activity.schema';

export interface RecordActivityDto {
  communityId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  type: ContactActivityType;
  campaignId?: string | Types.ObjectId;
  metadata?: Record<string, any>;
  occurredAt?: Date;
}

@Injectable()
export class ContactActivityService {
  constructor(
    @InjectModel(ContactActivity.name)
    private readonly activityModel: Model<ContactActivityDocument>,
  ) {}

  async record(dto: RecordActivityDto): Promise<ContactActivityDocument> {
    return this.activityModel.create({
      communityId: new Types.ObjectId(dto.communityId.toString()),
      userId: new Types.ObjectId(dto.userId.toString()),
      type: dto.type,
      campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId.toString()) : undefined,
      metadata: dto.metadata || {},
      occurredAt: dto.occurredAt || new Date(),
    });
  }

  async getTimeline(
    communityId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    { page = 1, limit = 20, types }: { page?: number; limit?: number; types?: ContactActivityType[] } = {},
  ) {
    const filter: Record<string, any> = {
      communityId: new Types.ObjectId(communityId.toString()),
      userId: new Types.ObjectId(userId.toString()),
    };
    if (types && types.length > 0) {
      filter.type = { $in: types };
    }
    const [items, total] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.activityModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }
}

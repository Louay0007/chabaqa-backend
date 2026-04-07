import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EmailSuppression,
  EmailSuppressionDocument,
  SuppressionReason,
  SuppressionSource,
} from '../schema/email-suppression.schema';

@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);

  constructor(
    @InjectModel(EmailSuppression.name)
    private readonly suppressionModel: Model<EmailSuppressionDocument>,
  ) {}

  async add(
    communityId: string | Types.ObjectId,
    email: string,
    reason: SuppressionReason,
    source: SuppressionSource,
    userId?: string | Types.ObjectId,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      await this.suppressionModel.updateOne(
        { communityId: new Types.ObjectId(communityId.toString()), email: normalizedEmail },
        {
          $setOnInsert: {
            communityId: new Types.ObjectId(communityId.toString()),
            email: normalizedEmail,
            reason,
            source,
            userId: userId ? new Types.ObjectId(userId.toString()) : undefined,
          },
        },
        { upsert: true },
      );
    } catch (err: any) {
      // Duplicate key on race condition — suppression already exists, safe to ignore
      if (err?.code !== 11000) {
        this.logger.error(`Failed to suppress ${email}: ${err?.message}`);
      }
    }
  }

  async isSuppressed(communityId: string | Types.ObjectId, email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const found = await this.suppressionModel.exists({
      communityId: new Types.ObjectId(communityId.toString()),
      email: normalizedEmail,
    });
    return Boolean(found);
  }

  async getBulkSuppressed(communityId: Types.ObjectId | string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const normalizedEmails = emails.map((e) => e.toLowerCase().trim());
    const found = await this.suppressionModel
      .find({ communityId: new Types.ObjectId(communityId.toString()), email: { $in: normalizedEmails } })
      .select('email')
      .lean();
    return new Set(found.map((f) => f.email));
  }

  async list(
    communityId: string | Types.ObjectId,
    { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
  ) {
    const filter = { communityId: new Types.ObjectId(communityId.toString()) };
    const [items, total] = await Promise.all([
      this.suppressionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.suppressionModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async remove(communityId: string | Types.ObjectId, email: string): Promise<void> {
    await this.suppressionModel.deleteOne({
      communityId: new Types.ObjectId(communityId.toString()),
      email: email.toLowerCase().trim(),
    });
  }
}

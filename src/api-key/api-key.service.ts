import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument, ApiKeyStatus } from '../schema/api-key.schema';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectModel(ApiKey.name)
    private apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  /**
   * Create a new API key.
   * The raw key is returned once and never stored in plain text.
   */
  async createApiKey(
    creatorId: string,
    communityId: string,
    name: string,
    permissions: string[] = [],
    expiresInDays?: number,
  ): Promise<{ apiKey: ApiKeyDocument; rawKey: string }> {
    if (!name?.trim()) {
      throw new BadRequestException('API key name is required');
    }

    // chabaqa_<uuid_no_dashes>_<16 random bytes hex>
    const rawKey = `chabaqa_${uuidv4().replace(/-/g, '')}_${crypto
      .randomBytes(16)
      .toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const apiKey = await this.apiKeyModel.create({
      creatorId: new Types.ObjectId(creatorId),
      communityId,
      name: name.trim(),
      keyHash,
      status: ApiKeyStatus.ACTIVE,
      permissions,
      expiresAt,
      rateLimitPerHour: 1000,
      hourWindowStart: new Date(),
    });

    this.logger.log(
      `API Key created: "${name}" for community ${communityId}`,
    );

    return { apiKey, rawKey };
  }

  /**
   * Validate an API key provided in a request header.
   * Returns the key document on success, or null on failure.
   */
  async validateApiKey(rawKey: string): Promise<ApiKeyDocument | null> {
    if (!rawKey) return null;

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyModel.findOne({
      keyHash,
      status: ApiKeyStatus.ACTIVE,
    });

    if (!apiKey) return null;

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      await this.apiKeyModel.findByIdAndUpdate(apiKey._id, {
        status: ApiKeyStatus.EXPIRED,
      });
      return null;
    }

    // Check rate limit — reset counter if the 1-hour window has passed
    const now = new Date();
    const windowStart = apiKey.hourWindowStart ?? new Date(0);
    const windowAge = now.getTime() - windowStart.getTime();

    if (windowAge > 60 * 60 * 1000) {
      // New window
      await this.apiKeyModel.findByIdAndUpdate(apiKey._id, {
        requestsThisHour: 1,
        hourWindowStart: now,
        lastUsedAt: now,
      });
    } else if (apiKey.requestsThisHour >= apiKey.rateLimitPerHour) {
      // Rate limit exceeded — still update lastUsedAt but refuse
      return null;
    } else {
      await this.apiKeyModel.findByIdAndUpdate(apiKey._id, {
        $inc: { requestsThisHour: 1 },
        lastUsedAt: now,
      });
    }

    return apiKey;
  }

  async getApiKeys(
    creatorId: string,
    communityId: string,
  ): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({
        creatorId: new Types.ObjectId(creatorId),
        communityId,
      })
      .sort({ createdAt: -1 });
  }

  async revokeApiKey(apiKeyId: string, creatorId: string): Promise<void> {
    const result = await this.apiKeyModel.updateOne(
      {
        _id: new Types.ObjectId(apiKeyId),
        creatorId: new Types.ObjectId(creatorId),
      },
      { status: ApiKeyStatus.REVOKED },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('API key not found');
    }
  }

  async getApiKeyStats(
    creatorId: string,
    communityId: string,
  ): Promise<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
  }> {
    const keys = await this.apiKeyModel.find({
      creatorId: new Types.ObjectId(creatorId),
      communityId,
    });

    return {
      total: keys.length,
      active: keys.filter((k) => k.status === ApiKeyStatus.ACTIVE).length,
      revoked: keys.filter((k) => k.status === ApiKeyStatus.REVOKED).length,
      expired: keys.filter((k) => k.status === ApiKeyStatus.EXPIRED).length,
    };
  }
}

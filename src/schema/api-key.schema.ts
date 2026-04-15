import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ required: true, type: String })
  communityId: string;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  /** SHA-256 hash of the raw key — used for lookup */
  @Prop({ required: true, type: String, unique: true })
  keyHash: string;

  /** Only stored transiently during creation, removed immediately after */
  @Prop({ type: String, select: false })
  rawKey?: string;

  @Prop({
    required: true,
    type: String,
    enum: ApiKeyStatus,
    default: ApiKeyStatus.ACTIVE,
  })
  status: ApiKeyStatus;

  /** e.g. ['read:posts', 'write:posts', 'read:members'] */
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Number, default: 1000 })
  rateLimitPerHour: number;

  @Prop({ type: Number, default: 0 })
  requestsThisHour: number;

  @Prop({ type: Date })
  hourWindowStart?: Date;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: String })
  lastUsedIp?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyDocument extends Document {
  _id: Types.ObjectId;
  creatorId: Types.ObjectId;
  communityId: string;
  name: string;
  keyHash: string;
  rawKey?: string;
  status: ApiKeyStatus;
  permissions: string[];
  expiresAt?: Date;
  rateLimitPerHour: number;
  requestsThisHour: number;
  hourWindowStart?: Date;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index({ creatorId: 1, communityId: 1 });
ApiKeySchema.index({ keyHash: 1 });
ApiKeySchema.index({ communityId: 1, status: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface UserSessionDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  deviceInfo: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  isRevoked: boolean;
  revokedAt?: Date;
  expiresAt: Date;
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'user_sessions' })
export class UserSession {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ required: false })
  deviceInfo: string;

  @Prop({ required: false })
  ipAddress: string;

  @Prop({ required: false })
  userAgent: string;

  @Prop({ default: () => new Date() })
  lastActiveAt: Date;

  @Prop({ default: false })
  isRevoked: boolean;

  @Prop({ required: false })
  revokedAt?: Date;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt: Date;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);

UserSessionSchema.index({ userId: 1 });
UserSessionSchema.index({ sessionId: 1 }, { unique: true });
UserSessionSchema.index({ userId: 1, isRevoked: 1 });
// TTL: auto-delete after 30 days
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

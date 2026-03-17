import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum MuteTarget {
  THREAD = 'thread',
  USER = 'user',
  COMMUNITY = 'community',
}

/**
 * Notification mute entry.
 * - thread: mute notifications for a specific post or conversation
 * - user:   mute notifications from a specific sender
 * - community: mute all notifications from a community
 *
 * Optional expiresAt for temporary mutes (TTL index auto-deletes expired docs).
 */
@Schema({ timestamps: true, collection: 'notification_mutes' })
export class NotificationMute extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(MuteTarget), required: true })
  targetType: MuteTarget;

  /** The ID of the muted entity (postId, conversationId, senderId, or communityId). */
  @Prop({ type: String, required: true })
  targetId: string;

  @Prop({ type: String, default: null })
  reason?: string;

  @Prop({ type: Date, default: null, index: { expires: 0 } })
  expiresAt?: Date | null;
}

export const NotificationMuteSchema = SchemaFactory.createForClass(NotificationMute);

NotificationMuteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

export type ConversationType =
  | 'COMMUNITY_DM'
  | 'HELP_DM'
  | 'PEER_DM'
  | 'SESSION_TEMP_DM'
  | 'LIVE_SUPPORT';

export type LiveSupportStatus = 'BOT_ACTIVE' | 'WAITING_ADMIN' | 'ASSIGNED' | 'CLOSED';

@Schema({ timestamps: true })
export class Conversation {
  _id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['COMMUNITY_DM', 'HELP_DM', 'PEER_DM', 'SESSION_TEMP_DM', 'LIVE_SUPPORT'],
    index: true,
  })
  type: ConversationType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  participantA: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  participantB?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', required: false, index: true })
  communityId?: Types.ObjectId;

  @Prop({ type: String, default: '' })
  lastMessageText: string;

  @Prop({ type: Date, index: true })
  lastMessageAt?: Date;

  @Prop({ type: Number, default: 0 })
  unreadCountA: number;

  @Prop({ type: Number, default: 0 })
  unreadCountB: number;

  @Prop({ type: Boolean, default: true })
  isOpen: boolean;

  @Prop({ type: String, required: false, index: true })
  sessionId?: string;

  @Prop({ type: String, required: false, index: true })
  sessionBookingId?: string;

  @Prop({ type: Date, required: false, index: true })
  expiresAt?: Date;

  @Prop({ type: Date, required: false, index: true })
  closedAt?: Date;

  @Prop({ type: String, required: false, enum: ['session_finished', 'booking_cancelled', 'booking_completed', 'manual'] })
  closeReason?: 'session_finished' | 'booking_cancelled' | 'booking_completed' | 'manual';

  @Prop({ type: String, required: false, enum: ['BOT_ACTIVE', 'WAITING_ADMIN', 'ASSIGNED', 'CLOSED'], index: true })
  supportStatus?: LiveSupportStatus;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: false, index: true })
  assignedAdminId?: Types.ObjectId;

  @Prop({ type: Date, required: false, index: true })
  requestedAdminAt?: Date;

  @Prop({ type: Date, required: false, index: true })
  claimedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: false, index: true })
  closedByAdminId?: Types.ObjectId;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index(
  { type: 1, participantA: 1, participantB: 1, communityId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: { $in: ['COMMUNITY_DM', 'PEER_DM'] },
      communityId: { $exists: true },
    },
  }
);

ConversationSchema.index(
  { type: 1, sessionBookingId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'SESSION_TEMP_DM',
      sessionBookingId: { $exists: true },
    },
  },
);

ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ type: 1, participantA: 1, isOpen: 1, updatedAt: -1 });
ConversationSchema.index({ type: 1, supportStatus: 1, requestedAdminAt: 1 });
ConversationSchema.index({ type: 1, assignedAdminId: 1, updatedAt: -1 });



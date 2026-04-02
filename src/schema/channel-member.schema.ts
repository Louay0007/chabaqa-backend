import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelMemberRole = 'member' | 'moderator';
export type ChannelNotificationLevel = 'all' | 'mentions' | 'none';

@Schema({ timestamps: true, collection: 'channel_members' })
export class ChannelMember {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', required: true, index: true })
  communityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ['member', 'moderator'], default: 'member' })
  role: ChannelMemberRole;

  @Prop({ type: Boolean, default: false })
  isMuted: boolean;

  @Prop({ type: String, enum: ['all', 'mentions', 'none'], default: 'mentions' })
  notificationLevel: ChannelNotificationLevel;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  addedBy: Types.ObjectId | null;
}

export type ChannelMemberDocument = ChannelMember & Document;
export const ChannelMemberSchema = SchemaFactory.createForClass(ChannelMember);

ChannelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
ChannelMemberSchema.index({ channelId: 1, role: 1 });
ChannelMemberSchema.index({ userId: 1, communityId: 1 });

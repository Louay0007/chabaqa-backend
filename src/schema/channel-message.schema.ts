import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ChannelMessageAttachment {
  @Prop({ required: true })
  url: string;

  @Prop({ type: String, enum: ['image', 'video', 'file', 'audio'] })
  type: string;

  @Prop()
  size: number;

  @Prop()
  name: string;

  @Prop()
  mimeType: string;
}
export const ChannelMessageAttachmentSchema = SchemaFactory.createForClass(ChannelMessageAttachment);

@Schema({ _id: false })
export class ChannelMessageReaction {
  @Prop({ required: true })
  emoji: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  userIds: Types.ObjectId[];
}
export const ChannelMessageReactionSchema = SchemaFactory.createForClass(ChannelMessageReaction);

@Schema({ timestamps: true, collection: 'channel_messages' })
export class ChannelMessage {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Community', required: true, index: true })
  communityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: String, default: '' })
  text: string;

  @Prop({ type: [ChannelMessageAttachmentSchema], default: [] })
  attachments: ChannelMessageAttachment[];

  @Prop({ type: [ChannelMessageReactionSchema], default: [] })
  reactions: ChannelMessageReaction[];

  @Prop({ type: Types.ObjectId, ref: 'ChannelMessage', default: null, index: true })
  parentMessageId: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  replyCount: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentions: Types.ObjectId[];

  @Prop({ type: Boolean, default: false, index: true })
  isPinned: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deletedFor: Types.ObjectId[];

  @Prop({ type: Boolean, default: false })
  isModeratorDeleted: boolean;

  @Prop({ type: Date, default: null })
  editedAt: Date | null;

  @Prop({ type: Object, default: null })
  linkPreview: { url: string; title: string; description: string; image: string } | null;

  @Prop({ type: Boolean, default: false })
  isSystem: boolean;

  @Prop({ type: String, default: null })
  systemEvent: string | null;
}

export type ChannelMessageDocument = ChannelMessage & Document;
export const ChannelMessageSchema = SchemaFactory.createForClass(ChannelMessage);

ChannelMessageSchema.index({ text: 'text' });
ChannelMessageSchema.index({ channelId: 1, createdAt: -1 });
ChannelMessageSchema.index({ parentMessageId: 1, createdAt: 1 });
ChannelMessageSchema.index({ channelId: 1, mentions: 1 });
ChannelMessageSchema.index({ channelId: 1, isPinned: 1 });
ChannelMessageSchema.index({ communityId: 1, createdAt: -1 });

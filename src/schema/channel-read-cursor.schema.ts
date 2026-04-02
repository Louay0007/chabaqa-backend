import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'channel_read_cursors' })
export class ChannelReadCursor {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true })
  channelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChannelMessage', default: null })
  lastReadMessageId: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastReadAt: Date | null;

  @Prop({ type: Number, default: 0 })
  unreadCount: number;
}

export type ChannelReadCursorDocument = ChannelReadCursor & Document;
export const ChannelReadCursorSchema = SchemaFactory.createForClass(ChannelReadCursor);

ChannelReadCursorSchema.index({ channelId: 1, userId: 1 }, { unique: true });
ChannelReadCursorSchema.index({ userId: 1 });

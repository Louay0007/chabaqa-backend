import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ _id: false })
export class MessageAttachment {
  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, enum: ['image', 'file', 'video'], required: true })
  type: 'image' | 'file' | 'video';

  @Prop({ type: Number, required: true })
  size: number;
}

export const MessageAttachmentSchema = SchemaFactory.createForClass(MessageAttachment);

@Schema({ timestamps: true })
export class Message {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: [MessageAttachmentSchema], default: [] })
  attachments: MessageAttachment[];

  @Prop({ type: Date })
  readAt?: Date;

  @Prop({ type: Date })
  editedAt?: Date;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  deletedFor: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ recipientId: 1, readAt: 1 });



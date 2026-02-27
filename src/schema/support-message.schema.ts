import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportMessageDocument = SupportMessage & Document;
export type SupportSenderType = 'user' | 'ai' | 'admin';

@Schema({ timestamps: true })
export class SupportMessage {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId;

  @Prop({ type: String, enum: ['user', 'ai', 'admin'], required: true, index: true })
  senderType: SupportSenderType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  senderUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: false, index: true })
  senderAdminId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 4000 })
  text: string;
}

export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);

SupportMessageSchema.index({ conversationId: 1, createdAt: -1 });

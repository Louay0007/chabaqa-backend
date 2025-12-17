import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

export type ConversationType = 'COMMUNITY_DM' | 'HELP_DM';

@Schema({ timestamps: true })
export class Conversation {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['COMMUNITY_DM', 'HELP_DM'], index: true })
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
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index(
  { type: 1, participantA: 1, participantB: 1, communityId: 1 },
  { unique: false }
);

ConversationSchema.index({ lastMessageAt: -1 });



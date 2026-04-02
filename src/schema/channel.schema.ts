import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelType = 'TEXT' | 'ANNOUNCEMENTS' | 'COURSE_CHAT' | 'EVENT_CHAT';
export type ChannelVisibility = 'PUBLIC' | 'PRIVATE';

@Schema({ timestamps: true, collection: 'channels' })
export class Channel {
  @Prop({ type: Types.ObjectId, ref: 'Community', required: true, index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, maxlength: 80, lowercase: true })
  slug: string;

  @Prop({ maxlength: 280, default: '' })
  description: string;

  @Prop({ type: String, enum: ['TEXT', 'ANNOUNCEMENTS', 'COURSE_CHAT', 'EVENT_CHAT'], default: 'TEXT' })
  type: ChannelType;

  @Prop({ type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' })
  visibility: ChannelVisibility;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Number, default: 0, index: true })
  position: number;

  @Prop({ type: Boolean, default: false, index: true })
  isArchived: boolean;

  @Prop({ type: Boolean, default: false })
  isPinned: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Cours', default: null })
  linkedCourseId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Event', default: null })
  linkedEventId: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  memberCount: number;

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  @Prop({ type: Date, default: null })
  lastMessageAt: Date | null;

  @Prop({ type: String, default: '' })
  lastMessagePreview: string;

  @Prop({ type: [String], default: [] })
  allowedRoles: string[];

  @Prop({ type: String, default: '' })
  emoji: string;
}

export type ChannelDocument = Channel & Document;
export const ChannelSchema = SchemaFactory.createForClass(Channel);

ChannelSchema.index({ communityId: 1, slug: 1 }, { unique: true });
ChannelSchema.index({ communityId: 1, position: 1, isArchived: 1 });
ChannelSchema.index({ communityId: 1, isArchived: 1, type: 1 });

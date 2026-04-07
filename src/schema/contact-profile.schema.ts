import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: { createdAt: false, updatedAt: true } })
export class ContactProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0, min: 0, max: 100 })
  leadScore: number;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, any>;

  updatedAt: Date;
}

export interface ContactProfileDocument extends ContactProfile, Document {}

export const ContactProfileSchema = SchemaFactory.createForClass(ContactProfile);

ContactProfileSchema.index({ communityId: 1, userId: 1 }, { unique: true });

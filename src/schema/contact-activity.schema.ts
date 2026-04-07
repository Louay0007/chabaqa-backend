import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ContactActivityType {
  EMAIL_OPEN = 'email_open',
  EMAIL_CLICK = 'email_click',
  PURCHASE = 'purchase',
  LOGIN = 'login',
  CONTENT_VIEW = 'content_view',
  TAG_ADDED = 'tag_added',
  UNSUBSCRIBED = 'unsubscribed',
  IMPORTED = 'imported',
}

@Schema()
export class ContactActivity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ContactActivityType, required: true })
  type: ContactActivityType;

  @Prop({ type: Types.ObjectId, ref: 'EmailCampaign' })
  campaignId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: () => new Date(), index: true })
  occurredAt: Date;
}

export interface ContactActivityDocument extends ContactActivity, Document {}

export const ContactActivitySchema = SchemaFactory.createForClass(ContactActivity);

ContactActivitySchema.index({ communityId: 1, userId: 1, occurredAt: -1 });
ContactActivitySchema.index({ communityId: 1, type: 1 });

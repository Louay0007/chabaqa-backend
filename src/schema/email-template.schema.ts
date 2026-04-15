import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum EmailTemplateCategory {
  ANNOUNCEMENT = 'announcement',
  NEWSLETTER = 'newsletter',
  PROMOTION = 'promotion',
  WELCOME = 'welcome',
  REMINDER = 'reminder',
  CUSTOM = 'custom',
}

@Schema({ timestamps: true, collection: 'crm_email_templates' })
export class CrmEmailTemplate {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Community', index: true })
  communityId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  creatorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: EmailTemplateCategory, default: EmailTemplateCategory.CUSTOM })
  category: EmailTemplateCategory;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  thumbnail?: string;

  @Prop({ type: [String], default: [] })
  variables: string[];

  @Prop({ default: false })
  isGlobal: boolean;

  @Prop({ default: 0 })
  usageCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface EmailTemplateDocument extends CrmEmailTemplate, Document {}

export const CrmEmailTemplateSchema = SchemaFactory.createForClass(CrmEmailTemplate);

// Keep backward compat alias
export const EmailTemplate = CrmEmailTemplate;
export const EmailTemplateSchema = CrmEmailTemplateSchema;


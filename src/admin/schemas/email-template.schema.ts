import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TemplateCategory {
  WELCOME = 'welcome',
  ANNOUNCEMENT = 'announcement',
  NEWSLETTER = 'newsletter',
  TRANSACTIONAL = 'transactional',
  MARKETING = 'marketing',
  NOTIFICATION = 'notification',
  CUSTOM = 'custom',
}

/**
 * Email template version for tracking changes
 */
@Schema({ _id: false })
export class TemplateVersion {
  @Prop({ required: true })
  version: number;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  changeNotes?: string;
}

export const TemplateVersionSchema = SchemaFactory.createForClass(TemplateVersion);

/**
 * Email template schema for managing reusable email templates
 */
@Schema({ timestamps: true })
export class EmailTemplate {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 3, maxlength: 100, unique: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, type: String, enum: TemplateCategory, index: true })
  category: TemplateCategory;

  @Prop({ required: true, minlength: 3, maxlength: 200 })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  variables: string[];

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastModifiedBy?: Types.ObjectId;

  @Prop({ default: 1 })
  currentVersion: number;

  @Prop({ type: [TemplateVersionSchema], default: [] })
  versionHistory: TemplateVersion[];

  @Prop({ default: 0 })
  usageCount: number;

  @Prop()
  lastUsedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type EmailTemplateDocument = EmailTemplate & Document;

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);

// Indexes for efficient queries
EmailTemplateSchema.index({ name: 1 });
EmailTemplateSchema.index({ category: 1, isActive: 1 });
EmailTemplateSchema.index({ tags: 1 });
EmailTemplateSchema.index({ createdAt: -1 });

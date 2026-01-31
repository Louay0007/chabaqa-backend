import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum NotificationType {
  SYSTEM = 'system',
  COMMUNITY = 'community',
  CONTENT = 'content',
  PAYMENT = 'payment',
  SOCIAL = 'social',
  ACHIEVEMENT = 'achievement',
  CUSTOM = 'custom',
}

export enum DeliveryMethod {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export type NotificationConfigDocument = NotificationConfig & Document;

/**
 * NotificationConfig schema for managing notification types and delivery methods
 * Allows admins to configure which notifications are enabled and how they are delivered
 */
@Schema({ timestamps: true })
export class NotificationConfig {
  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], enum: DeliveryMethod, required: true })
  enabledMethods: DeliveryMethod[];

  @Prop({ default: true })
  isEnabled: boolean;

  @Prop({ default: true })
  userControllable: boolean;

  @Prop({ default: true })
  defaultEnabled: boolean;

  @Prop({ enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' })
  priority: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationConfigSchema =
  SchemaFactory.createForClass(NotificationConfig);

// Indexes
NotificationConfigSchema.index({ type: 1 });
NotificationConfigSchema.index({ name: 1 }, { unique: true });
NotificationConfigSchema.index({ isEnabled: 1 });

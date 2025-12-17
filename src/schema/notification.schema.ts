
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum NotificationChannel {
  IN_APP = 'in-app',
  EMAIL = 'email',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  recipient: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  sender?: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  type: string; // e.g., 'new_dm_message', 'event_reminder'

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  body: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  data?: Record<string, any>; // For storing extra data like URLs

  @Prop({ type: Boolean, default: false, index: true })
  isRead: boolean;

  @Prop({ type: Date })
  readAt?: Date;

  @Prop({ type: String, enum: Object.values(NotificationChannel), required: true })
  channel: NotificationChannel;

  @Prop({ type: String, enum: Object.values(NotificationPriority), default: NotificationPriority.MEDIUM })
  priority: NotificationPriority;

  @Prop({ type: Date, index: { expires: '30d' } }) // Automatically delete after 30 days
  expiresAt?: Date;

  @Prop({ type: Date, default: null })
  sendAt?: Date; // For scheduled notifications
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

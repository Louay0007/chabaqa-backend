
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { NotificationChannel } from './notification.schema';

@Schema({ timestamps: true, collection: 'notification_templates' })
export class NotificationTemplate extends Document {
  @Prop({ type: String, required: true, unique: true, index: true })
  name: string; // e.g., 'new-dm-message'

  @Prop({ type: String, required: true })
  title: string; // e.g., 'You have a new message'

  @Prop({ type: String, required: true })
  body: string; // e.g., '{{senderName}} sent you a message.'

  @Prop({ type: String, enum: Object.values(NotificationChannel), required: true })
  channel: NotificationChannel;
}

export const NotificationTemplateSchema = SchemaFactory.createForClass(NotificationTemplate);

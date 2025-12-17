
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
class ChannelPreferences {
  @Prop({ type: Boolean, default: true })
  inApp: boolean;

  @Prop({ type: Boolean, default: true })
  email: boolean;
}

@Schema({ _id: false })
class QuietHours {
  @Prop({ type: String, default: '22:00' })
  start: string;

  @Prop({ type: String, default: '08:00' })
  end: string;

  @Prop({ type: Boolean, default: false })
  isEnabled: boolean;
}

@Schema({ timestamps: true, collection: 'notification_preferences' })
export class NotificationPreferences extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user: MongooseSchema.Types.ObjectId;

  @Prop({ type: Map, of: { type: Object }, default: new Map() })
  preferences: Map<string, ChannelPreferences>;

  @Prop({ type: QuietHours, default: () => ({}) })
  quietHours: QuietHours;
}

export const NotificationPreferencesSchema = SchemaFactory.createForClass(NotificationPreferences);

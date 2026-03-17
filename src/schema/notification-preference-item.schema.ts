import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
class ItemChannelPreferences {
  @Prop({ type: Boolean, default: true })
  inApp: boolean;

  @Prop({ type: Boolean, default: true })
  email: boolean;

  @Prop({ type: Boolean, default: true })
  push: boolean;
}

/**
 * Per-community, per-type notification preference override.
 * Compound unique index: (userId, communityId, type).
 * When communityId is null, the record acts as a global override for that type.
 */
@Schema({ timestamps: true, collection: 'notification_preference_items' })
export class NotificationPreferenceItem extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Community', default: null, index: true })
  communityId: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: ItemChannelPreferences, default: () => ({}) })
  channels: ItemChannelPreferences;
}

export const NotificationPreferenceItemSchema = SchemaFactory.createForClass(NotificationPreferenceItem);

NotificationPreferenceItemSchema.index(
  { userId: 1, communityId: 1, type: 1 },
  { unique: true },
);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscription extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, index: true })
  endpoint: string;

  @Prop({ type: String, required: true })
  p256dh: string;

  @Prop({ type: String, required: true })
  auth: string;

  @Prop({ type: Date, default: null })
  expirationTime?: Date | null;

  @Prop({ type: String, default: null })
  userAgent?: string | null;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);


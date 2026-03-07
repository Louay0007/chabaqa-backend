import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'processed_webhook_events' })
export class ProcessedWebhookEvent {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true, index: true })
  provider: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ required: true })
  processedAt: Date;
}

export type ProcessedWebhookEventDocument = HydratedDocument<ProcessedWebhookEvent>;

export const ProcessedWebhookEventSchema =
  SchemaFactory.createForClass(ProcessedWebhookEvent);

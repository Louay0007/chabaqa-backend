import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookConfig, WebhookConfigSchema } from '../schema/webhook-config.schema';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { CommunityAccessModule } from '../community-access/community-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookConfig.name, schema: WebhookConfigSchema },
    ]),
    CommunityAccessModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}

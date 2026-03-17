
import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Notification, NotificationSchema } from '../schema/notification.schema';
import { NotificationPreferences, NotificationPreferencesSchema } from '../schema/notification-preferences.schema';
import { NotificationPreferenceItem, NotificationPreferenceItemSchema } from '../schema/notification-preference-item.schema';
import { NotificationTemplate, NotificationTemplateSchema } from '../schema/notification-template.schema';
import { PushSubscription, PushSubscriptionSchema } from '../schema/push-subscription.schema';
import { NotificationMute, NotificationMuteSchema } from '../schema/notification-mute.schema';
import { NotificationDedupeLog, NotificationDedupeLogSchema } from '../schema/notification-dedupe-log.schema';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationScheduler } from './notification.scheduler';
import { NotificationRoutingService } from './notification-routing.service';
import { User, UserSchema } from '../schema/user.schema';
import { Event, EventSchema } from '../schema/event.schema';
import { EmailService } from '../common/services/email.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationPreferences.name, schema: NotificationPreferencesSchema },
      { name: NotificationPreferenceItem.name, schema: NotificationPreferenceItemSchema },
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      { name: NotificationMute.name, schema: NotificationMuteSchema },
      { name: NotificationDedupeLog.name, schema: NotificationDedupeLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Event.name, schema: EventSchema },
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, NotificationScheduler, NotificationRoutingService, EmailService],
  exports: [NotificationService],
})
export class NotificationModule {}

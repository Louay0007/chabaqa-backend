
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { InjectModel } from '@nestjs/mongoose';
import { Event, EventDocument } from '../schema/event.schema';
import { Model } from 'mongoose';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly notificationService: NotificationService,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleEventReminders() {
    this.logger.debug('Checking for upcoming events to send reminders...');
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingEvents = await this.eventModel.find({
      startDate: { $gte: now, $lte: twentyFourHoursFromNow },
      isPublished: true,
      isActive: true,
      reminderSent: { $ne: true }
    });

    for (const event of upcomingEvents) {
      for (const attendee of event.attendees) {
        this.notificationService.createNotification({
          recipient: attendee.userId.toString(),
          type: 'event_reminder',
          title: `Reminder: ${event.title}`,
          body: `The event "${event.title}" is starting soon!`,
          data: { eventId: (event as any)._id.toString() },
        });
      }
      event.reminderSent = true;
      await event.save();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  handleCron() {
    this.logger.debug('Running scheduled tasks for notifications...');
    // TODO: Implement logic for sending scheduled notifications and reminders
  }
}

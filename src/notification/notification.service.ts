
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationChannel } from '../schema/notification.schema';
import { NotificationPreferences } from '../schema/notification-preferences.schema';
import { NotificationTemplate } from '../schema/notification-template.schema';
import { PushSubscription } from '../schema/push-subscription.schema';
import { User } from '../schema/user.schema';
import { CreateNotificationDto } from '../dto-notification/create-notification.dto';
import { SavePushSubscriptionDto } from '../dto-notification/push-subscription.dto';
import { UpdateNotificationPreferencesDto } from '../dto-notification/update-notification-preferences.dto';
import { NotificationGateway } from './notification.gateway';
import { EmailService } from '../common/services/email.service';

const webpush = require('web-push');

type ResolvedChannelPreferences = {
  inApp: boolean;
  email: boolean;
  push: boolean;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly webPushEnabled: boolean;
  private readonly webPushPublicKey: string | null;

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @InjectModel(NotificationPreferences.name) private preferencesModel: Model<NotificationPreferences>,
    @InjectModel(NotificationTemplate.name) private templateModel: Model<NotificationTemplate>,
    @InjectModel(PushSubscription.name) private pushSubscriptionModel: Model<PushSubscription>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationGateway: NotificationGateway,
    private readonly emailService: EmailService,
  ) {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
    const subject = process.env.WEB_PUSH_SUBJECT?.trim();

    this.webPushEnabled = Boolean(publicKey && privateKey && subject);
    this.webPushPublicKey = publicKey || null;

    if (this.webPushEnabled) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn(
        'Web push is disabled. Set WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, and WEB_PUSH_SUBJECT to enable push notifications.',
      );
    }
  }

  async createNotification(dto: CreateNotificationDto): Promise<void> {
    const user = await this.userModel.findById(dto.recipient).exec();
    if (!user) {
      this.logger.warn(`User not found: ${dto.recipient}`);
      return;
    }

    const preferences = await this.getUserPreferences(user._id.toString());
    const channelPreferences = this.resolveChannelPreferences(preferences, dto.type);

    let inAppNotification: Notification | null = null;

    // In-App Notification
    if (channelPreferences.inApp) {
      try {
        inAppNotification = new this.notificationModel({
          ...dto,
          channel: NotificationChannel.IN_APP,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        await inAppNotification.save();
        this.notificationGateway.sendNotificationToUser(user._id.toString(), inAppNotification);
      } catch (error: any) {
        this.logger.warn(`Failed to persist in-app notification for user ${dto.recipient}: ${error?.message || 'unknown error'}`);
      }
    }

    // Email Notification
    if (channelPreferences.email) {
      try {
        if (!this.isInQuietHours(preferences)) {
          await this.emailService.sendGenericEmail({
            to: user.email,
            subject: dto.title,
            text: dto.body,
          });
        }
      } catch (error: any) {
        this.logger.warn(`Failed to send email notification to ${user.email}: ${error?.message || 'unknown error'}`);
      }
    }

    // Push Notification
    if (channelPreferences.push) {
      try {
        await this.sendPushNotification(
          user._id.toString(),
          dto,
          inAppNotification ? String((inAppNotification as any)._id) : undefined,
        );
      } catch (error: any) {
        this.logger.warn(`Failed to send push notification for user ${dto.recipient}: ${error?.message || 'unknown error'}`);
      }
    }
  }

  async getUserNotifications(userId: string): Promise<any[]> {
    const notifications = await this.notificationModel.find({ recipient: userId }).sort({ createdAt: -1 }).exec();

    // Transform to match frontend interface
    return notifications.map(notification => ({
      id: notification._id.toString(),
      userId: notification.recipient.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.body, // Map body to message for frontend
      isRead: notification.isRead,
      data: notification.data,
      createdAt: (notification as any).createdAt?.toISOString() || new Date().toISOString(),
    }));
  }

  async markAsRead(notificationId: string, userId: string): Promise<any | null> {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    ).exec();

    if (!notification) return null;

    // Transform to match frontend interface
    return {
      id: notification._id.toString(),
      userId: notification.recipient.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.body,
      isRead: notification.isRead,
      data: notification.data,
      createdAt: (notification as any).createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationModel
      .updateMany({ recipient: userId, isRead: false }, { isRead: true, readAt: new Date() })
      .exec();

    return Number((result as any).modifiedCount || 0);
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.notificationModel.deleteOne({ _id: notificationId, recipient: userId }).exec();
    return Number((result as any).deletedCount || 0) > 0;
  }

  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    let preferences = await this.preferencesModel.findOne({ user: userId }).exec();
    if (!preferences) {
      preferences = new this.preferencesModel({ user: userId });
      await preferences.save();
    }
    return preferences;
  }

  async updateUserPreferences(userId: string, dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferences> {
    const preferences = await this.getUserPreferences(userId);
    if (dto.preferences) {
      const entries =
        dto.preferences instanceof Map
          ? Array.from(dto.preferences.entries())
          : Object.entries(dto.preferences as Record<string, any>);

      entries.forEach(([key, value]: [string, any]) => {
        preferences.preferences.set(key, {
          inApp: value.inApp ?? true,
          email: value.email ?? true,
          push: value.push ?? true,
        });
      });
    }
    if (dto.quietHours) {
      preferences.quietHours = { ...preferences.quietHours, ...dto.quietHours };
    }
    return preferences.save();
  }

  getPushPublicKey(): { enabled: boolean; publicKey: string | null } {
    return {
      enabled: this.webPushEnabled,
      publicKey: this.webPushPublicKey,
    };
  }

  async savePushSubscription(
    userId: string,
    dto: SavePushSubscriptionDto,
    userAgent?: string,
  ): Promise<void> {
    const expirationTime =
      dto.expirationTime === null || dto.expirationTime === undefined
        ? null
        : new Date(dto.expirationTime);

    await this.pushSubscriptionModel
      .findOneAndUpdate(
        { endpoint: dto.endpoint },
        {
          user: userId,
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          expirationTime,
          userAgent: userAgent || null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.pushSubscriptionModel.deleteOne({ user: userId, endpoint }).exec();
  }

  private async sendPushNotification(
    userId: string,
    dto: CreateNotificationDto,
    notificationId?: string,
  ): Promise<void> {
    if (!this.webPushEnabled) return;

    const subscriptions = await this.pushSubscriptionModel.find({ user: userId }).lean().exec();
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      title: dto.title,
      body: dto.body,
      tag: `chabaqa:${dto.type}`,
      data: {
        ...dto.data,
        type: dto.type,
        notificationId,
        url: '/creator/notifications',
      },
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime
                ? new Date(subscription.expirationTime).getTime()
                : undefined,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
        } catch (error: any) {
          const statusCode = Number(error?.statusCode || error?.status || 0);
          if (statusCode === 404 || statusCode === 410) {
            await this.pushSubscriptionModel.deleteOne({ endpoint: subscription.endpoint }).exec();
            return;
          }

          this.logger.warn(
            `Failed to send push notification to endpoint ${subscription.endpoint}: ${error?.message || 'unknown error'}`,
          );
        }
      }),
    );
  }

  private resolveChannelPreferences(
    preferences: NotificationPreferences,
    notificationType: string,
  ): ResolvedChannelPreferences {
    const typed = preferences.preferences.get(notificationType) as any;
    const isCreatorMemberJoin = notificationType === 'new_community_member';
    return {
      inApp: isCreatorMemberJoin ? true : (typed?.inApp ?? true),
      email: typed?.email ?? true,
      push: isCreatorMemberJoin ? true : (typed?.push ?? true),
    };
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.isEnabled) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const { start, end } = preferences.quietHours;
    const startMinutes = this.parseTimeToMinutes(start);
    const endMinutes = this.parseTimeToMinutes(end);

    if (startMinutes === null || endMinutes === null) {
      return false;
    }

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else { // overnight
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  private parseTimeToMinutes(time: string): number | null {
    const normalized = String(time || '').trim();
    const parts = normalized.split(':');
    if (parts.length !== 2) return null;

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  // TODO: Add template rendering logic
}

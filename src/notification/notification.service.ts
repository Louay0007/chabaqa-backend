
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationChannel } from '../schema/notification.schema';
import { NotificationPreferences } from '../schema/notification-preferences.schema';
import { NotificationPreferenceItem } from '../schema/notification-preference-item.schema';
import { NotificationTemplate } from '../schema/notification-template.schema';
import { PushSubscription } from '../schema/push-subscription.schema';
import { NotificationMute } from '../schema/notification-mute.schema';
import { NotificationDedupeLog } from '../schema/notification-dedupe-log.schema';
import { User } from '../schema/user.schema';
import { CreateNotificationDto } from '../dto-notification/create-notification.dto';
import { SavePushSubscriptionDto } from '../dto-notification/push-subscription.dto';
import { UpdateNotificationPreferencesDto } from '../dto-notification/update-notification-preferences.dto';
import { UpsertNotificationPreferenceItemDto } from '../dto-notification/notification-preference-item.dto';
import { CreateNotificationMuteDto } from '../dto-notification/notification-mute.dto';
import { NotificationGateway } from './notification.gateway';
import { NotificationRoutingService } from './notification-routing.service';
import { EmailService } from '../common/services/email.service';
import {
  DEFAULT_CHANNEL_PREFERENCES,
  FORCED_NOTIFICATION_TYPES,
  HIGH_PRIORITY_TYPES,
} from './notification-types';

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
    @InjectModel(NotificationPreferenceItem.name) private preferenceItemModel: Model<NotificationPreferenceItem>,
    @InjectModel(NotificationTemplate.name) private templateModel: Model<NotificationTemplate>,
    @InjectModel(PushSubscription.name) private pushSubscriptionModel: Model<PushSubscription>,
    @InjectModel(NotificationMute.name) private muteModel: Model<NotificationMute>,
    @InjectModel(NotificationDedupeLog.name) private dedupeLogModel: Model<NotificationDedupeLog>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly notificationGateway: NotificationGateway,
    private readonly notificationRouting: NotificationRoutingService,
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

    // --- Dedupe check ---
    if (dto.data?.dedupeKey) {
      const isDuplicate = await this.checkDedupe(dto.recipient, dto.data.dedupeKey);
      if (isDuplicate) {
        this.logger.debug(`Deduplicated notification for user ${dto.recipient}: ${dto.data.dedupeKey}`);
        return;
      }
    }

    // --- Mute check ---
    const isMuted = await this.isNotificationMuted(dto.recipient, dto);
    if (isMuted) {
      this.logger.debug(`Notification muted for user ${dto.recipient}, type=${dto.type}`);
      return;
    }

    const communityId = dto.data?.communityId || null;
    const preferences = await this.getUserPreferences(user._id.toString());
    const channelPreferences = await this.resolveChannelPreferences(
      preferences,
      dto.type,
      user._id.toString(),
      communityId,
    );

    const isHighPriority = HIGH_PRIORITY_TYPES.has(dto.type);
    const inQuietHours = this.isInQuietHours(preferences);

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

    // Email Notification (suppressed during quiet hours unless high priority)
    if (channelPreferences.email) {
      try {
        if (!inQuietHours || isHighPriority) {
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

    // Push Notification (suppressed during quiet hours unless high priority)
    if (channelPreferences.push) {
      try {
        if (!inQuietHours || isHighPriority) {
          await this.sendPushNotification(
            user._id.toString(),
            dto,
            inAppNotification ? String((inAppNotification as any)._id) : undefined,
          );
        }
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

    const deepLinkUrl = this.notificationRouting.resolveUrl(dto.type, dto.data);

    const payload = JSON.stringify({
      title: dto.title,
      body: dto.body,
      tag: `chabaqa:${dto.type}`,
      data: {
        ...dto.data,
        type: dto.type,
        notificationId,
        url: deepLinkUrl,
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

  private async resolveChannelPreferences(
    preferences: NotificationPreferences,
    notificationType: string,
    userId: string,
    communityId?: string | null,
  ): Promise<ResolvedChannelPreferences> {
    const isForced = FORCED_NOTIFICATION_TYPES.has(notificationType);

    // 1) Check community override
    if (communityId) {
      const communityOverride = await this.preferenceItemModel
        .findOne({ userId, communityId, type: notificationType })
        .lean()
        .exec();
      if (communityOverride) {
        return {
          inApp: isForced ? true : (communityOverride.channels?.inApp ?? true),
          email: communityOverride.channels?.email ?? true,
          push: isForced ? true : (communityOverride.channels?.push ?? true),
        };
      }
    }

    // 2) Check global preference item override (communityId = null)
    const globalItem = await this.preferenceItemModel
      .findOne({ userId, communityId: null, type: notificationType })
      .lean()
      .exec();
    if (globalItem) {
      return {
        inApp: isForced ? true : (globalItem.channels?.inApp ?? true),
        email: globalItem.channels?.email ?? true,
        push: isForced ? true : (globalItem.channels?.push ?? true),
      };
    }

    // 3) Check legacy preferences map
    const typed = preferences.preferences.get(notificationType) as any;
    if (typed) {
      return {
        inApp: isForced ? true : (typed?.inApp ?? true),
        email: typed?.email ?? true,
        push: isForced ? true : (typed?.push ?? true),
      };
    }

    // 4) Fallback to hardcoded defaults
    const defaults = DEFAULT_CHANNEL_PREFERENCES[notificationType];
    return {
      inApp: isForced ? true : (defaults?.inApp ?? true),
      email: defaults?.email ?? true,
      push: isForced ? true : (defaults?.push ?? true),
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

  // ===== Mute System =====

  private async isNotificationMuted(recipientId: string, dto: CreateNotificationDto): Promise<boolean> {
    const conditions: any[] = [];
    if (dto.data?.communityId) {
      conditions.push({ userId: recipientId, targetType: 'community', targetId: dto.data.communityId });
    }
    if (dto.sender) {
      conditions.push({ userId: recipientId, targetType: 'user', targetId: dto.sender });
    }
    if (dto.data?.postId) {
      conditions.push({ userId: recipientId, targetType: 'thread', targetId: dto.data.postId });
    }
    if (dto.data?.conversationId) {
      conditions.push({ userId: recipientId, targetType: 'thread', targetId: dto.data.conversationId });
    }
    if (conditions.length === 0) return false;

    const mute = await this.muteModel.findOne({ $or: conditions }).lean().exec();
    return !!mute;
  }

  async getUserMutes(userId: string): Promise<any[]> {
    return this.muteModel.find({ userId }).sort({ createdAt: -1 }).lean().exec();
  }

  async createMute(userId: string, dto: CreateNotificationMuteDto): Promise<NotificationMute> {
    return this.muteModel.findOneAndUpdate(
      { userId, targetType: dto.targetType, targetId: dto.targetId },
      {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason || null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async removeMute(userId: string, targetType: string, targetId: string): Promise<boolean> {
    const result = await this.muteModel.deleteOne({ userId, targetType, targetId }).exec();
    return Number((result as any).deletedCount || 0) > 0;
  }

  // ===== Dedupe =====

  private async checkDedupe(userId: string, dedupeKey: string, ttlSeconds = 300): Promise<boolean> {
    try {
      await this.dedupeLogModel.create({
        userId,
        dedupeKey,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });
      return false; // not a duplicate
    } catch (error: any) {
      if (error?.code === 11000) return true; // duplicate key = already exists
      this.logger.warn(`Dedupe check failed: ${error?.message}`);
      return false; // allow through on error
    }
  }

  // ===== Preference Items (per-community overrides) =====

  async getPreferenceItems(userId: string, communityId?: string | null): Promise<any[]> {
    const filter: any = { userId };
    if (communityId !== undefined) {
      filter.communityId = communityId || null;
    }
    return this.preferenceItemModel.find(filter).lean().exec();
  }

  async upsertPreferenceItem(userId: string, dto: UpsertNotificationPreferenceItemDto): Promise<NotificationPreferenceItem> {
    return this.preferenceItemModel.findOneAndUpdate(
      { userId, communityId: dto.communityId || null, type: dto.type },
      {
        userId,
        communityId: dto.communityId || null,
        type: dto.type,
        channels: {
          inApp: dto.channels.inApp ?? true,
          email: dto.channels.email ?? true,
          push: dto.channels.push ?? true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async bulkUpsertPreferenceItems(userId: string, items: UpsertNotificationPreferenceItemDto[]): Promise<NotificationPreferenceItem[]> {
    const results: NotificationPreferenceItem[] = [];
    for (const item of items) {
      results.push(await this.upsertPreferenceItem(userId, item));
    }
    return results;
  }

  // ===== Push Status & Test =====

  async getPushStatus(userId: string): Promise<{
    supported: boolean;
    enabled: boolean;
    subscriptionCount: number;
  }> {
    const subscriptionCount = await this.pushSubscriptionModel.countDocuments({ user: userId }).exec();
    return {
      supported: this.webPushEnabled,
      enabled: subscriptionCount > 0,
      subscriptionCount,
    };
  }

  async sendTestPush(userId: string): Promise<{ sent: boolean; message: string }> {
    if (!this.webPushEnabled) {
      return { sent: false, message: 'Web push is not configured on the server.' };
    }

    const subscriptions = await this.pushSubscriptionModel.find({ user: userId }).lean().exec();
    if (!subscriptions.length) {
      return { sent: false, message: 'No push subscriptions found. Enable push notifications first.' };
    }

    const payload = JSON.stringify({
      title: 'Test Notification',
      body: 'Push notifications are working! 🎉',
      tag: 'chabaqa:test',
      data: { type: 'test', url: '/creator/notifications' },
    });

    let sentCount = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime
              ? new Date(subscription.expirationTime).getTime()
              : undefined,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        sentCount++;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          await this.pushSubscriptionModel.deleteOne({ endpoint: subscription.endpoint }).exec();
        }
      }
    }

    return {
      sent: sentCount > 0,
      message: sentCount > 0
        ? `Test push sent to ${sentCount} device(s).`
        : 'All subscriptions were invalid and have been cleaned up.',
    };
  }
}

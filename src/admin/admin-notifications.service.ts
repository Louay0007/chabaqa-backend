import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Community, CommunityDocument } from '../schema/community.schema';
import { Conversation, ConversationDocument } from '../schema/conversation.schema';
import { ContentModerationQueue, ContentModerationQueueDocument, ModerationPriority, ModerationStatus } from './schemas/content-moderation-queue.schema';
import { SecurityMonitoringService } from './common/services/security-monitoring.service';
import { AdminAlertConfig, AdminAlertConfigDocument } from './analytics-dashboard/schemas/admin-alert-config.schema';

export type AdminNotificationCategory =
  | 'pending_moderation'
  | 'pending_communities'
  | 'security_alerts'
  | 'live_support_queue'
  | 'analytics_threshold_alerts';

export interface AdminNotificationSummaryItem {
  category: AdminNotificationCategory;
  count: number;
  label: string;
  href: string;
}

export interface AdminNotificationSummary {
  total: number;
  items: AdminNotificationSummaryItem[];
  generatedAt: string;
}

export interface AdminNotificationFeedItem {
  id: string;
  category: AdminNotificationCategory;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  href: string;
  count?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdminNotificationsService {
  constructor(
    @InjectModel(ContentModerationQueue.name)
    private readonly moderationQueueModel: Model<ContentModerationQueueDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(AdminAlertConfig.name)
    private readonly adminAlertConfigModel: Model<AdminAlertConfigDocument>,
    private readonly securityMonitoringService: SecurityMonitoringService,
  ) {}

  async getSummary(): Promise<AdminNotificationSummary> {
    const items = await this.getSummaryItems();

    return {
      total: items.reduce((sum, item) => sum + item.count, 0),
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  async getFeed(limit = 8): Promise<{ items: AdminNotificationFeedItem[]; total: number; generatedAt: string }> {
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const [summaryItems, moderationItems, communities, supportTickets, analyticsAlerts] = await Promise.all([
      this.getSummaryItems(),
      this.moderationQueueModel
        .find({ status: ModerationStatus.PENDING })
        .sort({ submittedAt: 1, priority: -1 })
        .limit(3)
        .lean(),
      this.communityModel
        .find({ approvalStatus: 'pending' })
        .sort({ createdAt: 1 })
        .limit(3)
        .select('name slug createdAt')
        .lean(),
      this.conversationModel
        .find({
          type: 'LIVE_SUPPORT',
          isOpen: true,
          supportStatus: 'WAITING_ADMIN',
        })
        .sort({ requestedAdminAt: 1, updatedAt: 1 })
        .limit(3)
        .select('requestedAdminAt updatedAt lastMessageText')
        .lean(),
      this.getRecentTriggeredAnalyticsAlerts(3),
    ]);

    const unresolvedSecurityAlerts = this.securityMonitoringService
      .getAlerts({ resolved: false })
      .sort((a, b) => {
        const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
        const severityDelta =
          severityOrder[a.severity as keyof typeof severityOrder] -
          severityOrder[b.severity as keyof typeof severityOrder];
        if (severityDelta !== 0) return severityDelta * -1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 3);

    const feed: AdminNotificationFeedItem[] = [];

    for (const item of moderationItems) {
      feed.push({
        id: `moderation-${String(item._id)}`,
        category: 'pending_moderation',
        severity: item.priority === ModerationPriority.URGENT ? 'critical' : item.priority === ModerationPriority.HIGH ? 'warning' : 'info',
        title: `Moderation review needed`,
        message: `${item.contentType} is waiting for moderation review`,
        href: '/admin/content-moderation',
        createdAt: new Date(item.submittedAt || new Date()).toISOString(),
        metadata: {
          contentType: item.contentType,
          priority: item.priority,
          queueItemId: String(item._id),
        },
      });
    }

    for (const community of communities) {
      feed.push({
        id: `community-${String(community._id)}`,
        category: 'pending_communities',
        severity: 'warning',
        title: `Community approval required`,
        message: `${String(community.name || 'Community')} is waiting for approval`,
        href: '/admin/communities',
        createdAt: new Date(community.createdAt || new Date()).toISOString(),
        metadata: {
          communityId: String(community._id),
          slug: community.slug,
        },
      });
    }

    for (const alert of unresolvedSecurityAlerts) {
      if (!alert) continue;
      const timestamp = alert.timestamp instanceof Date ? alert.timestamp : new Date(alert.timestamp || Date.now());
      feed.push({
        id: `security-${alert.id || timestamp.getTime()}`,
        category: 'security_alerts',
        severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'warning' : 'info',
        title: alert.title || 'Security Alert',
        message: alert.description || 'Action required',
        href: '/admin/security/events',
        createdAt: timestamp.toISOString(),
        metadata: {
          alertType: alert.type,
          resolved: alert.resolved,
        },
      });
    }

    for (const ticket of supportTickets) {
      feed.push({
        id: `support-${String(ticket._id)}`,
        category: 'live_support_queue',
        severity: 'warning',
        title: 'Live support ticket waiting',
        message: String(ticket.lastMessageText || 'A customer is waiting for an admin reply'),
        href: '/admin/communication/support',
        createdAt: new Date(ticket.requestedAdminAt || new Date()).toISOString(),
        metadata: {
          ticketId: String(ticket._id),
        },
      });
    }

    for (const alert of analyticsAlerts) {
      feed.push({
        id: `analytics-${String(alert._id)}`,
        category: 'analytics_threshold_alerts',
        severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info',
        title: `Analytics alert triggered`,
        message: `${alert.name} crossed its configured threshold`,
        href: '/admin/analytics',
        createdAt: new Date(alert.lastTriggered || alert.updatedAt || alert.createdAt || new Date()).toISOString(),
        metadata: {
          metricType: alert.metricType,
          threshold: alert.threshold,
          triggerCount: alert.triggerCount,
        },
      });
    }

    for (const summary of summaryItems.filter((item) => item.count > 0)) {
      const alreadyRepresented = feed.some((item) => item.category === summary.category);
      if (!alreadyRepresented) {
        feed.push({
          id: `summary-${summary.category}`,
          category: summary.category,
          severity: summary.category === 'security_alerts' ? 'critical' : 'info',
          title: summary.label,
          message: `${summary.count} pending item${summary.count === 1 ? '' : 's'} require attention`,
          href: summary.href,
          count: summary.count,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const items = feed
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);

    return {
      items,
      total: summaryItems.reduce((sum, item) => sum + item.count, 0),
      generatedAt: new Date().toISOString(),
    };
  }

  private async getSummaryItems(): Promise<AdminNotificationSummaryItem[]> {
    const [pendingModeration, pendingCommunities, supportQueueCount, analyticsAlertCount] = await Promise.all([
      this.moderationQueueModel.countDocuments({ status: ModerationStatus.PENDING }),
      this.communityModel.countDocuments({ approvalStatus: 'pending' }),
      this.conversationModel.countDocuments({
        type: 'LIVE_SUPPORT',
        isOpen: true,
        supportStatus: 'WAITING_ADMIN',
      }),
      this.countRecentTriggeredAnalyticsAlerts(),
    ]);

    const unresolvedSecurityAlerts = this.securityMonitoringService.getAlerts({ resolved: false }).length;

    return [
      {
        category: 'pending_moderation',
        count: pendingModeration,
        label: 'Pending moderation',
        href: '/admin/content-moderation',
      },
      {
        category: 'pending_communities',
        count: pendingCommunities,
        label: 'Pending communities',
        href: '/admin/communities',
      },
      {
        category: 'security_alerts',
        count: unresolvedSecurityAlerts,
        label: 'Security alerts',
        href: '/admin/security/events',
      },
      {
        category: 'live_support_queue',
        count: supportQueueCount,
        label: 'Live support queue',
        href: '/admin/communication/support',
      },
      {
        category: 'analytics_threshold_alerts',
        count: analyticsAlertCount,
        label: 'Analytics alerts',
        href: '/admin/analytics',
      },
    ];
  }

  private async countRecentTriggeredAnalyticsAlerts(): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.adminAlertConfigModel.countDocuments({
      isEnabled: true,
      triggerCount: { $gt: 0 },
      lastTriggered: { $gte: sevenDaysAgo },
    });
  }

  private async getRecentTriggeredAnalyticsAlerts(limit: number) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.adminAlertConfigModel
      .find({
        isEnabled: true,
        triggerCount: { $gt: 0 },
        lastTriggered: { $gte: sevenDaysAgo },
      })
      .sort({ lastTriggered: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
  }
}

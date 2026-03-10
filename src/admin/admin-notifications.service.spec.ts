import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminNotificationsService } from './admin-notifications.service';
import { ContentModerationQueue } from './schemas/content-moderation-queue.schema';
import { Community } from '../schema/community.schema';
import { Conversation } from '../schema/conversation.schema';
import { AdminAlertConfig } from './analytics-dashboard/schemas/admin-alert-config.schema';
import { SecurityMonitoringService } from './common/services/security-monitoring.service';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;

  const moderationModel = {
    countDocuments: jest.fn(),
    find: jest.fn(),
  };
  const communityModel = {
    countDocuments: jest.fn(),
    find: jest.fn(),
  };
  const conversationModel = {
    countDocuments: jest.fn(),
    find: jest.fn(),
  };
  const adminAlertConfigModel = {
    countDocuments: jest.fn(),
    find: jest.fn(),
  };
  const securityMonitoringService = {
    getAlerts: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        {
          provide: getModelToken(ContentModerationQueue.name),
          useValue: moderationModel,
        },
        {
          provide: getModelToken(Community.name),
          useValue: communityModel,
        },
        {
          provide: getModelToken(Conversation.name),
          useValue: conversationModel,
        },
        {
          provide: getModelToken(AdminAlertConfig.name),
          useValue: adminAlertConfigModel,
        },
        {
          provide: SecurityMonitoringService,
          useValue: securityMonitoringService,
        },
      ],
    }).compile();

    service = module.get(AdminNotificationsService);
  });

  it('aggregates notification summary counts from real admin work queues', async () => {
    moderationModel.countDocuments.mockResolvedValueOnce(4);
    communityModel.countDocuments.mockResolvedValueOnce(2);
    conversationModel.countDocuments.mockResolvedValueOnce(3);
    adminAlertConfigModel.countDocuments.mockResolvedValueOnce(1);
    securityMonitoringService.getAlerts.mockReturnValue([
      { id: 'sec-1', resolved: false },
      { id: 'sec-2', resolved: false },
    ]);

    const result = await service.getSummary();

    expect(result.total).toBe(12);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'pending_moderation', count: 4 }),
        expect.objectContaining({ category: 'pending_communities', count: 2 }),
        expect.objectContaining({ category: 'security_alerts', count: 2 }),
        expect.objectContaining({ category: 'live_support_queue', count: 3 }),
        expect.objectContaining({ category: 'analytics_threshold_alerts', count: 1 }),
      ]),
    );
  });

  it('builds a feed ordered by recency and backed by source records', async () => {
    moderationModel.countDocuments.mockResolvedValueOnce(1);
    communityModel.countDocuments.mockResolvedValueOnce(1);
    conversationModel.countDocuments.mockResolvedValueOnce(1);
    adminAlertConfigModel.countDocuments.mockResolvedValueOnce(1);
    securityMonitoringService.getAlerts.mockReturnValue([
      {
        id: 'sec-1',
        type: 'multiple_failed_attempts',
        severity: 'critical',
        title: 'Critical alert',
        description: 'Repeated failures',
        timestamp: new Date('2026-03-09T09:00:00.000Z'),
        resolved: false,
      },
    ]);

    moderationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'mod-1',
              contentType: 'post',
              priority: 'urgent',
              submittedAt: new Date('2026-03-09T08:00:00.000Z'),
            },
          ]),
        }),
      }),
    });

    communityModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'community-1',
                name: 'Alpha',
                slug: 'alpha',
                createdAt: new Date('2026-03-08T08:00:00.000Z'),
              },
            ]),
          }),
        }),
      }),
    });

    conversationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'ticket-1',
                requestedAdminAt: new Date('2026-03-09T10:00:00.000Z'),
                updatedAt: new Date('2026-03-09T10:05:00.000Z'),
                lastMessageText: 'Need help',
              },
            ]),
          }),
        }),
      }),
    });

    adminAlertConfigModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'alert-1',
              name: 'Pending content spike',
              severity: 'warning',
              metricType: 'pending_content',
              threshold: 10,
              triggerCount: 2,
              createdAt: new Date('2026-03-07T10:00:00.000Z'),
              updatedAt: new Date('2026-03-09T09:30:00.000Z'),
              lastTriggered: new Date('2026-03-09T09:30:00.000Z'),
            },
          ]),
        }),
      }),
    });

    const result = await service.getFeed(5);

    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(5);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        category: 'live_support_queue',
        href: '/admin/communication/support',
      }),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'security_alerts', href: '/admin/security/events' }),
        expect.objectContaining({ category: 'pending_moderation', href: '/admin/content-moderation' }),
        expect.objectContaining({ category: 'pending_communities', href: '/admin/communities' }),
        expect.objectContaining({ category: 'analytics_threshold_alerts', href: '/admin/analytics' }),
      ]),
    );
  });
});

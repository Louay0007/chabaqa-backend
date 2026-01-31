import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CommunicationManagementService } from './communication-management.service';
import { EmailCampaign, EmailCampaignStatus } from '../../schema/email-campaign.schema';
import { User } from '../../schema/user.schema';
import { Community } from '../../schema/community.schema';
import { Notification } from '../../schema/notification.schema';
import { NotificationConfig } from '../schemas/notification-config.schema';
import { EmailTemplate } from '../schemas/email-template.schema';
import { EmailService } from '../../common/services/email.service';
import { NotificationService } from '../../notification/notification.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { Types } from 'mongoose';

describe('CommunicationManagementService - Analytics', () => {
  let service: CommunicationManagementService;
  let emailCampaignModel: any;

  const mockEmailCampaignModel = {
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const mockUserModel = {
    find: jest.fn(),
  };

  const mockCommunityModel = {
    findById: jest.fn(),
  };

  const mockNotificationModel = {
    find: jest.fn(),
  };

  const mockNotificationConfigModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockEmailTemplateModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockEmailService = {
    sendGenericEmail: jest.fn(),
  };

  const mockNotificationService = {
    createNotification: jest.fn(),
  };

  const mockAuditLogService = {
    logAction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationManagementService,
        {
          provide: getModelToken(EmailCampaign.name),
          useValue: mockEmailCampaignModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: getModelToken(Community.name),
          useValue: mockCommunityModel,
        },
        {
          provide: getModelToken(Notification.name),
          useValue: mockNotificationModel,
        },
        {
          provide: getModelToken(NotificationConfig.name),
          useValue: mockNotificationConfigModel,
        },
        {
          provide: getModelToken(EmailTemplate.name),
          useValue: mockEmailTemplateModel,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<CommunicationManagementService>(CommunicationManagementService);
    emailCampaignModel = module.get(getModelToken(EmailCampaign.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCommunicationMetrics', () => {
    it('should calculate communication metrics correctly', async () => {
      const mockCampaigns = [
        {
          _id: new Types.ObjectId(),
          totalRecipients: 1000,
          sentCount: 980,
          failedCount: 20,
          openCount: 450,
          clickCount: 120,
          recipients: [
            { status: 'bounced' },
            { status: 'bounced' },
          ],
        },
        {
          _id: new Types.ObjectId(),
          totalRecipients: 500,
          sentCount: 490,
          failedCount: 10,
          openCount: 200,
          clickCount: 50,
          recipients: [
            { status: 'bounced' },
          ],
        },
      ];

      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockCampaigns),
        }),
      });

      const result = await service.getCommunicationMetrics({});

      expect(result.totalCampaigns).toBe(2);
      expect(result.totalEmailsSent).toBe(1500);
      expect(result.totalDelivered).toBe(1470);
      expect(result.totalOpened).toBe(650);
      expect(result.totalClicks).toBe(170);
      expect(result.totalBounced).toBe(3);
      expect(result.averageOpenRate).toBeGreaterThan(0);
      expect(result.averageClickRate).toBeGreaterThan(0);
      expect(result.averageDeliveryRate).toBeGreaterThan(0);
    });

    it('should return zero metrics when no campaigns exist', async () => {
      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getCommunicationMetrics({});

      expect(result.totalCampaigns).toBe(0);
      expect(result.totalEmailsSent).toBe(0);
      expect(result.averageOpenRate).toBe(0);
      expect(result.averageClickRate).toBe(0);
    });
  });

  describe('getCampaignPerformance', () => {
    it('should return campaign performance details', async () => {
      const mockCampaigns = [
        {
          _id: new Types.ObjectId(),
          title: 'Welcome Campaign',
          totalRecipients: 1000,
          sentCount: 980,
          openCount: 450,
          clickCount: 120,
          sentAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-15'),
        },
      ];

      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockCampaigns),
        }),
      });

      const result = await service.getCampaignPerformance({});

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Welcome Campaign');
      expect(result[0].totalSent).toBe(1000);
      expect(result[0].delivered).toBe(980);
      expect(result[0].opened).toBe(450);
      expect(result[0].clicked).toBe(120);
      expect(result[0].openRate).toBeGreaterThan(0);
      expect(result[0].clickRate).toBeGreaterThan(0);
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return delivery status for campaigns', async () => {
      const mockCampaigns = [
        {
          _id: new Types.ObjectId(),
          title: 'Test Campaign',
          totalRecipients: 1000,
          sentCount: 900,
          failedCount: 50,
          status: EmailCampaignStatus.SENT,
          recipients: [
            { status: 'bounced' },
            { status: 'bounced' },
          ],
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockCampaigns),
        }),
      });

      const result = await service.getDeliveryStatus({});

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Campaign');
      expect(result[0].totalRecipients).toBe(1000);
      expect(result[0].sent).toBe(900);
      expect(result[0].failed).toBe(50);
      expect(result[0].bounced).toBe(2);
      expect(result[0].pending).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getEngagementStatistics', () => {
    it('should calculate engagement statistics', async () => {
      const mockCampaigns = [
        {
          _id: new Types.ObjectId(),
          title: 'Campaign 1',
          totalRecipients: 1000,
          sentCount: 980,
          openCount: 450,
          clickCount: 120,
        },
        {
          _id: new Types.ObjectId(),
          title: 'Campaign 2',
          totalRecipients: 500,
          sentCount: 490,
          openCount: 100,
          clickCount: 30,
        },
      ];

      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockCampaigns),
        }),
      });

      const result = await service.getEngagementStatistics({});

      expect(result.campaignsCount).toBe(2);
      expect(result.totalRecipients).toBe(1500);
      expect(result.uniqueEngaged).toBeGreaterThan(0);
      expect(result.engagementRate).toBeGreaterThan(0);
      expect(result.bestCampaign).toBeDefined();
      expect(result.worstCampaign).toBeDefined();
    });

    it('should return zero statistics when no campaigns exist', async () => {
      mockEmailCampaignModel.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.getEngagementStatistics({});

      expect(result.campaignsCount).toBe(0);
      expect(result.totalRecipients).toBe(0);
      expect(result.engagementRate).toBe(0);
    });
  });
});

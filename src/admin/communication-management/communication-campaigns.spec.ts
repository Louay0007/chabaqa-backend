import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
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

describe('CommunicationManagementService - Campaign Endpoints', () => {
  let service: CommunicationManagementService;
  let emailCampaignModel: any;
  let userModel: any;

  beforeEach(async () => {
    const mockEmailCampaignModel = {
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const mockUserModel = {
      find: jest.fn(),
    };

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
          useValue: { findById: jest.fn() },
        },
        {
          provide: getModelToken(Notification.name),
          useValue: {},
        },
        {
          provide: getModelToken(NotificationConfig.name),
          useValue: {},
        },
        {
          provide: getModelToken(EmailTemplate.name),
          useValue: {},
        },
        {
          provide: EmailService,
          useValue: {
            sendGenericEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: {
            logAction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CommunicationManagementService>(CommunicationManagementService);
    emailCampaignModel = module.get(getModelToken(EmailCampaign.name));
    userModel = module.get(getModelToken(User.name));
  });

  it('should return campaign by id', async () => {
    const campaign = {
      _id: new Types.ObjectId(),
      title: 'Campaign',
      metadata: {},
    };

    const exec = jest.fn().mockResolvedValue(campaign);
    const lean = jest.fn().mockReturnValue({ exec });
    const populateSecond = jest.fn().mockReturnValue({ lean });
    const populateFirst = jest.fn().mockReturnValue({ populate: populateSecond });
    emailCampaignModel.findById.mockReturnValue({ populate: populateFirst });

    const result = await service.getCampaignById(campaign._id.toString());

    expect(result).toEqual(campaign);
    expect(emailCampaignModel.findById).toHaveBeenCalledWith(campaign._id.toString());
  });

  it('should throw NotFoundException when updating missing campaign', async () => {
    emailCampaignModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.updateCampaign(
        new Types.ObjectId().toString(),
        { title: 'Updated' },
        new Types.ObjectId().toString(),
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when campaign has no recipients on send', async () => {
    const campaignDoc = {
      _id: new Types.ObjectId(),
      title: 'Empty Campaign',
      subject: 'No recipients',
      content: 'content',
      type: 'custom',
      status: EmailCampaignStatus.DRAFT,
      metadata: { audienceTarget: 'all_users' },
      communityId: new Types.ObjectId(),
      totalRecipients: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    emailCampaignModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(campaignDoc),
    });
    userModel.find.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      service.sendCampaignById(
        campaignDoc._id.toString(),
        new Types.ObjectId().toString(),
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { EmailCampaignService } from './email-campaign.service';
import { EmailCampaign, EmailCampaignStatus } from '../schema/email-campaign.schema';
import { User } from '../schema/user.schema';
import { Community } from '../schema/community.schema';
import { EmailService } from '../common/services/email.service';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import { EmailCampaignQueueService } from './email-campaign.queue';

describe('EmailCampaignService', () => {
  let service: EmailCampaignService;
  let emailCampaignModel: any;
  let queueService: { queueCampaignSend: jest.Mock; removeScheduledCampaignSend: jest.Mock };
  let emailService: { sendGenericEmail: jest.Mock };

  const creatorId = new Types.ObjectId().toString();
  const communityId = new Types.ObjectId();

  const community = {
    _id: communityId,
    name: 'Chabaqa Test Community',
    members: [new Types.ObjectId()],
  };

  const members = [{ _id: new Types.ObjectId(), email: 'member@test.com', name: 'Member One' }];

  const buildCampaignDoc = (data: Record<string, any>) => {
    const doc: any = {
      _id: new Types.ObjectId(),
      title: data.title,
      subject: data.subject,
      content: data.content,
      communityId: data.communityId,
      creatorId: data.creatorId,
      recipients: data.recipients || [],
      totalRecipients: data.totalRecipients || 0,
      status: data.status,
      scheduledAt: data.scheduledAt,
      sentCount: data.sentCount || 0,
      failedCount: data.failedCount || 0,
      isInactiveUserCampaign: data.isInactiveUserCampaign || false,
      targetDaysThreshold: data.targetDaysThreshold,
      targetInactivityPeriod: data.targetInactivityPeriod,
      metadata: data.metadata || {},
      isHtml: data.isHtml || false,
      save: jest.fn(),
      populate: jest.fn().mockResolvedValue(undefined),
    };
    doc.save.mockResolvedValue(doc);
    return doc;
  };

  beforeEach(async () => {
    const emailCampaignCtor: any = jest.fn().mockImplementation((data) => buildCampaignDoc(data));
    Object.assign(emailCampaignCtor, {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      deleteOne: jest.fn(),
    });

    const userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(members),
          }),
        }),
      }),
    };

    const communityModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(community),
      }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ name: community.name }),
          }),
        }),
      }),
    };

    queueService = {
      queueCampaignSend: jest.fn().mockResolvedValue({ queued: true, jobId: 'job', delayMs: 0 }),
      removeScheduledCampaignSend: jest.fn().mockResolvedValue(true),
    };

    emailService = {
      sendGenericEmail: jest.fn().mockResolvedValue(undefined),
    };

    const userLoginActivityService = {
      getAllInactiveUsers: jest.fn().mockResolvedValue([]),
      getInactiveUsersByPeriod: jest.fn().mockResolvedValue([]),
      updateReactivationEmailSent: jest.fn().mockResolvedValue(undefined),
      getInactivityStats: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailCampaignService,
        { provide: getModelToken(EmailCampaign.name), useValue: emailCampaignCtor },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Community.name), useValue: communityModel },
        { provide: EmailService, useValue: emailService },
        { provide: UserLoginActivityService, useValue: userLoginActivityService },
        { provide: EmailCampaignQueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<EmailCampaignService>(EmailCampaignService);
    emailCampaignModel = module.get(getModelToken(EmailCampaign.name));
  });

  it('creates scheduled campaign when scheduledAt is in the future', async () => {
    const scheduledAt = new Date(Date.now() + 3600_000).toISOString();
    const result = await service.createCampaign(creatorId, {
      title: 'Scheduled Campaign',
      subject: 'Hello {{userName}}',
      content: 'Body',
      communityId: communityId.toString(),
      scheduledAt,
    });

    expect(result.status).toBe(EmailCampaignStatus.SCHEDULED);
    expect(queueService.queueCampaignSend).toHaveBeenCalledTimes(1);
  });

  it('creates draft campaign when scheduledAt is missing', async () => {
    const result = await service.createCampaign(creatorId, {
      title: 'Draft Campaign',
      subject: 'Hello',
      content: 'Body',
      communityId: communityId.toString(),
    });

    expect(result.status).toBe(EmailCampaignStatus.DRAFT);
    expect(queueService.queueCampaignSend).not.toHaveBeenCalled();
  });

  it('queues manual send and returns queued response', async () => {
    const campaignDoc = buildCampaignDoc({
      title: 'Manual',
      subject: 'Subject',
      content: 'Body',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.SCHEDULED,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    const result = await service.sendCampaign(campaignDoc._id.toString(), creatorId);

    expect(result.queued).toBe(true);
    expect(queueService.queueCampaignSend).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: campaignDoc._id.toString(),
        requestedBy: creatorId,
        trigger: 'manual',
      }),
    );
    expect(campaignDoc.status).toBe(EmailCampaignStatus.DRAFT);
    expect(campaignDoc.save).toHaveBeenCalled();
  });

  it('renders personalized templates during queued send execution', async () => {
    const recipient = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Personalized',
      subject: 'Hello {{userName}} from {{communityName}}',
      content: 'Today is {{currentDate}}',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: false,
    });

    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    expect(emailService.sendGenericEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: recipient.email,
        subject: expect.stringContaining('Member One'),
        text: expect.stringContaining('Today is'),
      }),
    );
    expect(campaignDoc.sentCount).toBe(1);
    expect(campaignDoc.status).toBe(EmailCampaignStatus.SENT);
  });
});

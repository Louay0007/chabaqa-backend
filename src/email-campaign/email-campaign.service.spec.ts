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
  let emailService: { sendGenericEmail: jest.Mock; isAuthenticationFailureError: jest.Mock };

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
      trackOpens: data.trackOpens !== false,
      trackClicks: data.trackClicks !== false,
      openCount: data.openCount || 0,
      clickCount: data.clickCount || 0,
      save: jest.fn(),
      populate: jest.fn().mockResolvedValue(undefined),
      markModified: jest.fn(),
    };
    doc.save.mockResolvedValue(doc);
    return doc;
  };

  const extractTrackingToken = (value: string, eventType: 'open' | 'click'): string => {
    const regex = new RegExp(`/api/email-campaigns/track/${eventType}\\?t=([^"'\\s>]+)`);
    const match = value.match(regex);
    expect(match).toBeTruthy();
    return decodeURIComponent(match?.[1] || '');
  };

  beforeEach(async () => {
    process.env.SERVER_URL = 'https://api.chabaqa.io';
    process.env.FRONTEND_URL = 'https://chabaqa.io';

    const emailCampaignCtor: any = jest.fn().mockImplementation((data) => buildCampaignDoc(data));
    Object.assign(emailCampaignCtor, {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      deleteOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
      }),
      exists: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      }),
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
      isAuthenticationFailureError: jest.fn().mockReturnValue(false),
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

  it('returns success message when campaign is already sending', async () => {
    const campaignDoc = buildCampaignDoc({
      title: 'Already sending',
      subject: 'Subject',
      content: 'Body',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.SENDING,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    const result = await service.sendCampaign(campaignDoc._id.toString(), creatorId);

    expect(result).toEqual({
      queued: true,
      campaignId: campaignDoc._id.toString(),
      message: 'Campaign is already being sent',
    });
    expect(queueService.queueCampaignSend).not.toHaveBeenCalled();
  });

  it('allows retry for failed campaigns', async () => {
    const failedRecipient = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'failed',
      opened: false,
      clickCount: 0,
      errorMessage: 'SMTP auth failed',
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Failed campaign',
      subject: 'Subject',
      content: 'Body',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.FAILED,
      recipients: [failedRecipient],
      totalRecipients: 1,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    const result = await service.sendCampaign(campaignDoc._id.toString(), creatorId);

    expect(result.queued).toBe(true);
    expect(campaignDoc.status).toBe(EmailCampaignStatus.DRAFT);
    expect(campaignDoc.scheduledAt).toBeUndefined();
    expect(campaignDoc.recipients[0].status).toBe('pending');
    expect(campaignDoc.recipients[0].errorMessage).toBeUndefined();
    expect(queueService.queueCampaignSend).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: campaignDoc._id.toString(),
        requestedBy: creatorId,
        trigger: 'manual',
      }),
    );
    expect(campaignDoc.save).toHaveBeenCalled();
  });

  it('renders personalized templates during queued send execution', async () => {
    const recipient: any = {
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

  it('injects open tracking pixel when trackOpens is enabled', async () => {
    const recipient: any = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Open tracking',
      subject: 'Hello {{userName}}',
      content: '<p>Tracked content</p>',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: true,
      trackOpens: true,
      trackClicks: false,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    const mailPayload = emailService.sendGenericEmail.mock.calls[0][0];
    expect(mailPayload.html).toContain('/api/email-campaigns/track/open?t=');
  });

  it('rewrites links for click tracking', async () => {
    const recipient: any = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Click tracking',
      subject: 'Hello {{userName}}',
      content: '<p><a href="https://example.com/docs?ref=campaign">Read docs</a></p>',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: true,
      trackOpens: false,
      trackClicks: true,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    const mailPayload = emailService.sendGenericEmail.mock.calls[0][0];
    expect(mailPayload.html).toContain('/api/email-campaigns/track/click?t=');
    expect(mailPayload.html).not.toContain('href="https://example.com/docs?ref=campaign"');
  });

  it('records open events idempotently from tracking token', async () => {
    const recipient: any = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Open events',
      subject: 'Hello {{userName}}',
      content: '<p>Body</p>',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: true,
      trackOpens: true,
      trackClicks: false,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    const mailPayload = emailService.sendGenericEmail.mock.calls[0][0];
    const token = extractTrackingToken(mailPayload.html, 'open');

    const first = await service.recordOpenByToken(token);
    const second = await service.recordOpenByToken(token);
    const openTrackingUpdates = emailCampaignModel.updateOne.mock.calls.filter(
      ([filter]: any[]) => filter?.trackOpens?.$ne === false,
    );

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(emailCampaignModel.exists).toHaveBeenCalledTimes(2);
    expect(openTrackingUpdates).toHaveLength(2);
    expect(openTrackingUpdates[0][1]).toEqual(
      expect.objectContaining({
        $set: expect.objectContaining({
          'recipients.$.opened': true,
        }),
        $inc: expect.objectContaining({
          openCount: 1,
        }),
      }),
    );
  });

  it('records click events and marks recipient opened', async () => {
    const recipient: any = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Click events',
      subject: 'Hello {{userName}}',
      content: '<p><a href="https://example.com/path">Open link</a></p>',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: true,
      trackOpens: true,
      trackClicks: true,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    const mailPayload = emailService.sendGenericEmail.mock.calls[0][0];
    const token = extractTrackingToken(mailPayload.html, 'click');

    const redirectOne = await service.recordClickByToken(token);
    const redirectTwo = await service.recordClickByToken(token);
    const clickTrackingUpdates = emailCampaignModel.updateOne.mock.calls.filter(
      ([filter]: any[]) => filter?.trackClicks?.$ne === false,
    );
    const openOnClickUpdates = emailCampaignModel.updateOne.mock.calls.filter(
      ([filter]: any[]) => filter?.trackOpens?.$ne === false,
    );

    expect(redirectOne).toBe('https://example.com/path');
    expect(redirectTwo).toBe('https://example.com/path');
    expect(clickTrackingUpdates).toHaveLength(2);
    expect(clickTrackingUpdates[0][1]).toEqual(
      expect.objectContaining({
        $inc: expect.objectContaining({
          'recipients.$.clickCount': 1,
          clickCount: 1,
        }),
        $push: expect.objectContaining({
          'recipients.$.clickedAt': expect.any(Date),
        }),
      }),
    );
    expect(openOnClickUpdates.length).toBeGreaterThanOrEqual(2);
  });

  it('continues processing campaigns already in sending status', async () => {
    const recipient: any = {
      userId: new Types.ObjectId(),
      email: 'member@test.com',
      name: 'Member One',
      status: 'pending',
      opened: false,
      clickCount: 0,
    };
    const campaignDoc = buildCampaignDoc({
      title: 'Resume sending',
      subject: 'Hello {{userName}}',
      content: 'Body',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.SENDING,
      recipients: [recipient],
      totalRecipients: 1,
      isHtml: false,
    });
    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'retry',
      attempt: 1,
    });

    expect(emailService.sendGenericEmail).toHaveBeenCalledTimes(1);
    expect(campaignDoc.status).toBe(EmailCampaignStatus.SENT);
    expect(campaignDoc.sentCount).toBe(1);
  });

  it('handles invalid, forged and expired tracking tokens safely', async () => {
    const fallbackUrl = (service as any).getInvalidClickRedirectUrl();
    const invalidTokenOpenResult = await service.recordOpenByToken('invalid-token');
    const invalidTokenClickResult = await service.recordClickByToken('invalid-token');
    expect(invalidTokenOpenResult).toBe(false);
    expect(invalidTokenClickResult).toBe(fallbackUrl);

    const forgedToken = (service as any).signTrackingPayload({
      v: 1,
      type: 'click',
      campaignId: new Types.ObjectId().toString(),
      recipientUserId: new Types.ObjectId().toString(),
      recipientEmail: 'member@test.com',
      url: 'https://example.com/forged',
      exp: Date.now() + 60_000,
    });
    const tampered = `${forgedToken}tampered`;
    const forgedClickResult = await service.recordClickByToken(tampered);
    expect(forgedClickResult).toBe(fallbackUrl);

    const expiredToken = (service as any).signTrackingPayload({
      v: 1,
      type: 'click',
      campaignId: new Types.ObjectId().toString(),
      recipientUserId: new Types.ObjectId().toString(),
      recipientEmail: 'member@test.com',
      url: 'https://example.com/expired',
      exp: Date.now() - 1000,
    });
    const expiredClickResult = await service.recordClickByToken(expiredToken);
    expect(expiredClickResult).toBe(fallbackUrl);
  });

  it('computes average click rate using unique clickers', async () => {
    const campaigns = [
      {
        sentCount: 10,
        failedCount: 0,
        openCount: 6,
        clickCount: 9,
        isInactiveUserCampaign: false,
        recipients: [{ clickCount: 2 }, { clickCount: 0 }, { clickCount: 7 }],
      },
      {
        sentCount: 5,
        failedCount: 1,
        openCount: 2,
        clickCount: 3,
        isInactiveUserCampaign: true,
        recipients: [{ clickCount: 0 }, { clickCount: 3 }],
      },
    ];
    emailCampaignModel.find.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(campaigns),
      }),
    });

    const stats = await service.getCampaignStats(creatorId, communityId.toString());

    expect(stats.totalClicks).toBe(12);
    expect(stats.totalEmailsSent).toBe(15);
    expect(stats.averageClickRate).toBeCloseTo((3 / 15) * 100, 5);
  });

  it('aborts remaining recipients when smtp authentication fails', async () => {
    const recipients = Array.from({ length: 11 }, (_, index) => ({
      userId: new Types.ObjectId(),
      email: `member${index}@test.com`,
      name: `Member ${index}`,
      status: 'pending' as const,
      opened: false,
      clickCount: 0,
    }));

    const campaignDoc = buildCampaignDoc({
      title: 'Auth failure campaign',
      subject: 'Hello {{userName}}',
      content: 'Body',
      communityId,
      creatorId: new Types.ObjectId(creatorId),
      status: EmailCampaignStatus.DRAFT,
      recipients,
      totalRecipients: recipients.length,
    });

    emailCampaignModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(campaignDoc) });
    emailService.sendGenericEmail.mockRejectedValue(new Error('Invalid login: 535-5.7.8 Username and Password not accepted.'));
    emailService.isAuthenticationFailureError.mockImplementation((error: Error) =>
      error.message.includes('Invalid login'),
    );

    await service.executeSendCampaignJob({
      campaignId: campaignDoc._id.toString(),
      requestedBy: creatorId,
      trigger: 'manual',
    });

    expect(emailService.sendGenericEmail).toHaveBeenCalledTimes(10);
    expect(campaignDoc.failedCount).toBe(11);
    expect(campaignDoc.status).toBe(EmailCampaignStatus.FAILED);
  });
});

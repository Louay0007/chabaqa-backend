import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  CampaignStatsDto,
  CreateContentReminderDto,
  CreateCourseProgressCampaignDto,
  CreateEmailCampaignDto,
  CreateInactiveUserCampaignDto,
  CreateWelcomeTemplateDto,
  EmailCampaignQueryDto,
  InactiveUserQueryDto,
  InactiveUserStatsDto,
  PreviewAudienceDto,
  PreviewAudienceResponseDto,
  UpdateEmailCampaignDto,
  UpdateWelcomeTemplateDto,
} from '../dto-email-campaign/email-campaign.dto';
import { EmailService } from '../common/services/email.service';
import { Community, CommunityDocument } from '../schema/community.schema';
import {
  AutomationEventTrigger,
  EmailCampaign,
  EmailCampaignDocument,
  EmailCampaignStatus,
  EmailCampaignType,
  EmailRecipient,
  InactivityPeriod,
} from '../schema/email-campaign.schema';
import { User, UserDocument } from '../schema/user.schema';
import { UserLoginActivityDocument } from '../schema/user-login-activity.schema';
import { UserLoginActivityService } from '../user-login-activity/user-login-activity.service';
import { contentTypeToLabel, inactivityPeriodToText, renderTemplate } from './email-campaign-template.util';
import { EmailCampaignQueueService } from './email-campaign.queue';
import { PolicyService } from '../common/services/policy.service';
import { Subscription, SubscriptionDocument } from '../schema/subscription.schema';
import { EmailCampaignSendJobPayload } from './email-campaign.jobs';

type RecipientsQuery = { page?: number; limit?: number; status?: string; opened?: boolean };
type SendRecipientResult = { authenticationFailure: boolean };
type TrackingEventType = 'open' | 'click';
type TrackingTokenPayload = {
  v: 1;
  type: TrackingEventType;
  campaignId: string;
  recipientUserId: string;
  recipientEmail: string;
  exp: number;
  url?: string;
};

const TRACKING_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 365; // 1 year
const DEFAULT_TRACKING_SECRET = 'local-dev-email-tracking-secret-change-me';
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);

  constructor(
    @InjectModel(EmailCampaign.name)
    private readonly emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Community.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel('CourseEnrollment')
    private readonly courseEnrollmentModel: Model<any>,
    @InjectModel('UserLoginActivity')
    private readonly userLoginActivityModel: Model<any>,
    private readonly emailService: EmailService,
    private readonly userLoginActivityService: UserLoginActivityService,
    private readonly emailCampaignQueueService: EmailCampaignQueueService,
    private readonly policyService: PolicyService,
  ) {}

  /**
   * Validate that the creator has remaining email campaign quota for the month.
   * Skipped when PLAN_ENFORCEMENT_MODE=false.
   */
  private async validateEmailCampaignQuota(creatorId: string, recipientCount: number): Promise<void> {
    const enforcementOn = process.env.PLAN_ENFORCEMENT_MODE === 'true';
    if (!enforcementOn) return;

    // Count recipients already sent to this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const usedThisMonth = await this.emailCampaignModel.aggregate([
      {
        $match: {
          creatorId: new (await import('mongoose')).Types.ObjectId(creatorId),
          createdAt: { $gte: monthStart },
          status: { $in: ['sent', 'sending', 'scheduled'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalRecipients' } } },
    ]);
    const used = usedThisMonth[0]?.total ?? 0;

    const remaining = await this.policyService.getRemainingQuota(
      creatorId,
      'emailCampaign',
      used,
    );

    if (remaining < recipientCount) {
      const limits = await this.policyService.getEffectiveLimitsForCreator(creatorId);
      throw new ForbiddenException(
        `Email campaign quota exceeded. Used ${used}/${limits.emailCampaignRecipientsPerMonth} recipients this month. ` +
        `Cannot send to ${recipientCount} additional recipients. Please upgrade your plan.`,
      );
    }
  }

  async createCampaign(creatorId: string, dto: CreateEmailCampaignDto): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const recipients = await this.buildCommunityRecipients(community);

    // Enforce email campaign quota
    await this.validateEmailCampaignQuota(creatorId, recipients.length);
    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      scheduledAt,
      type: dto.type || EmailCampaignType.CUSTOM,
      status,
      isHtml: dto.isHtml || false,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      metadata: dto.metadata || {},
    });

    const savedCampaign = await campaign.save();
    await this.enqueueIfScheduled(savedCampaign, creatorId, 'scheduled');

    this.logger.log(
      `Created campaign ${savedCampaign._id.toString()} for community ${dto.communityId} with ${recipients.length} recipients`,
    );

    return savedCampaign;
  }

  async createInactiveUserCampaign(
    creatorId: string,
    dto: CreateInactiveUserCampaignDto,
  ): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const inactiveUsers = await this.getInactiveUsersForCampaign(dto);
    const recipients = inactiveUsers.map((userActivity) => {
      const user = userActivity.userId as any;
      return {
        userId: user._id,
        email: user.email,
        name: user.name,
        status: 'pending',
        opened: false,
        clickCount: 0,
      } as EmailRecipient;
    });

    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);
    const targetDaysThreshold = this.getDaysThreshold(dto.inactivityPeriod as InactivityPeriod);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      isInactiveUserCampaign: true,
      targetInactivityPeriod: dto.inactivityPeriod,
      targetDaysThreshold,
      targetAllInactive: dto.targetAllInactive || false,
      scheduledAt,
      type: EmailCampaignType.INACTIVE_USER_REACTIVATION,
      status,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      isHtml: dto.isHtml || false,
      metadata: {
        ...dto.metadata,
        reactivationCampaign: true,
        targetPeriod: dto.inactivityPeriod,
        targetDaysThreshold,
        communityName: community.name,
      },
    });

    const savedCampaign = await campaign.save();
    await this.enqueueIfScheduled(savedCampaign, creatorId, 'scheduled');

    return savedCampaign;
  }

  async createAndSendContentReminder(
    creatorId: string,
    dto: CreateContentReminderDto,
  ): Promise<{ campaignId: string; queued: true }> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    const recipients = await this.buildCommunityRecipients(community);
    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      scheduledAt,
      type: EmailCampaignType.CUSTOM,
      status,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      isHtml: dto.isHtml || false,
      metadata: {
        ...dto.metadata,
        contentReminder: true,
        contentType: dto.contentType,
        contentId: dto.contentId,
        communityName: community.name,
      },
    });

    const savedCampaign = await campaign.save();
    await this.emailCampaignQueueService.queueCampaignSend(
      {
        campaignId: savedCampaign._id.toString(),
        requestedBy: creatorId,
        trigger: scheduledAt ? 'scheduled' : 'content-reminder',
      },
      scheduledAt,
    );

    return { campaignId: savedCampaign._id.toString(), queued: true };
  }

  // ─── Course Progress Campaign ───────────────────────────────────────────────

  async createCourseProgressCampaign(
    creatorId: string,
    dto: CreateCourseProgressCampaignDto,
  ): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);
    if (!Types.ObjectId.isValid(dto.targetCourseId)) {
      throw new BadRequestException('Invalid targetCourseId');
    }

    const recipients = await this.resolveCourseProgressAudience(
      dto.communityId,
      dto.targetCourseId,
      dto.targetMaxProgressPct,
      dto.targetMinEnrolledDays,
      dto.maxRecipients || 5000,
    );

    const scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
    const status = this.resolveCampaignStatus(scheduledAt);

    const campaign = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      isCourseProgressCampaign: true,
      targetCourseId: new Types.ObjectId(dto.targetCourseId),
      targetMaxProgressPct: dto.targetMaxProgressPct,
      targetMinEnrolledDays: dto.targetMinEnrolledDays,
      type: EmailCampaignType.COURSE_PROGRESS_REMINDER,
      scheduledAt,
      status,
      isHtml: dto.isHtml || false,
      trackOpens: dto.trackOpens !== false,
      trackClicks: dto.trackClicks !== false,
      metadata: {
        communityName: community.name,
        courseProgressReminder: true,
        targetCourseId: dto.targetCourseId,
        targetMaxProgressPct: dto.targetMaxProgressPct,
        targetMinEnrolledDays: dto.targetMinEnrolledDays,
      },
    });

    const savedCampaign = await campaign.save();
    await this.enqueueIfScheduled(savedCampaign, creatorId, 'scheduled');

    this.logger.log(
      `Created course progress campaign ${savedCampaign._id.toString()} — ${recipients.length} recipients (progress < ${dto.targetMaxProgressPct}%, enrolled >= ${dto.targetMinEnrolledDays}d)`,
    );
    return savedCampaign;
  }

  // ─── Audience Preview ───────────────────────────────────────────────────────

  async previewCampaignAudience(creatorId: string, dto: PreviewAudienceDto): Promise<PreviewAudienceResponseDto> {
    await this.verifyCommunityAccess(creatorId, dto.communityId);

    if (dto.filterType === 'inactivity') {
      if (!dto.inactiveFilter) {
        throw new BadRequestException('inactiveFilter is required for filterType=inactivity');
      }
      const cutoff = new Date(Date.now() - dto.inactiveFilter.minInactiveDays * 24 * 60 * 60 * 1000);
      const activities = await this.userLoginActivityModel
        .find({
          communityId: new Types.ObjectId(dto.communityId),
          lastLoginAt: { $lt: cutoff },
        })
        .populate('userId', 'email name')
        .limit(1000)
        .lean()
        .exec();

      const sample = activities.slice(0, 10).map((a: any) => ({
        userId: String(a.userId?._id || a.userId),
        email: a.userId?.email || '',
        name: a.userId?.name || '',
      }));

      return { total: activities.length, sample, filterType: 'inactivity' };
    }

    if (dto.filterType === 'course_progress') {
      if (!dto.courseProgressFilter) {
        throw new BadRequestException('courseProgressFilter is required for filterType=course_progress');
      }
      const { courseId, maxProgressPct, minEnrolledDays } = dto.courseProgressFilter;
      if (!Types.ObjectId.isValid(courseId)) {
        throw new BadRequestException('Invalid courseId');
      }
      const recipients = await this.resolveCourseProgressAudience(
        dto.communityId,
        courseId,
        maxProgressPct,
        minEnrolledDays,
        1000,
      );

      const sample = recipients.slice(0, 10).map((r) => ({
        userId: String(r.userId),
        email: r.email,
        name: r.name,
      }));

      return { total: recipients.length, sample, filterType: 'course_progress' };
    }

    throw new BadRequestException('Unsupported filterType');
  }

  private async resolveCourseProgressAudience(
    communityId: string,
    courseId: string,
    maxProgressPct: number,
    minEnrolledDays: number,
    limit: number,
  ): Promise<EmailRecipient[]> {
    const enrolledBefore = new Date(Date.now() - minEnrolledDays * 24 * 60 * 60 * 1000);

    // Fetch enrollments for this course created before the threshold
    const enrollments = await this.courseEnrollmentModel
      .find({
        courseId: new Types.ObjectId(courseId),
        isActive: true,
        createdAt: { $lte: enrolledBefore },
      })
      .populate('userId', '_id email name')
      .limit(limit * 2) // over-fetch before filtering
      .lean()
      .exec();

    // Get community member IDs for scoping
    const community = await this.communityModel
      .findById(communityId)
      .select('members')
      .lean()
      .exec();

    const memberIds = new Set((community?.members || []).map((m: any) => String(m)));

    const qualifying: EmailRecipient[] = [];

    for (const enrollment of enrollments) {
      const user = enrollment.userId as any;
      if (!user || !memberIds.has(String(user._id))) continue;

      const progressEntries: Array<{ isCompleted: boolean }> = enrollment.progression || [];
      const totalChapters = progressEntries.length;
      const completedChapters = progressEntries.filter((p) => p.isCompleted).length;
      const progressPct = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

      if (progressPct < maxProgressPct) {
        qualifying.push({
          userId: user._id,
          email: user.email,
          name: user.name || user.email,
          status: 'pending',
          opened: false,
          clickCount: 0,
        } as EmailRecipient);
      }

      if (qualifying.length >= limit) break;
    }

    return qualifying;
  }

  // ─── Welcome Automation Template ────────────────────────────────────────────

  async createWelcomeTemplate(
    creatorId: string,
    communityId: string,
    dto: CreateWelcomeTemplateDto,
  ): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, communityId);

    // Deactivate any existing welcome template for this community
    await this.emailCampaignModel
      .updateMany(
        {
          communityId: new Types.ObjectId(communityId),
          isAutomationTemplate: true,
          eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
        },
        { $set: { automationActive: false } },
      )
      .exec();

    const template = new this.emailCampaignModel({
      title: `Welcome Email — ${community.name}`,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(communityId),
      creatorId: new Types.ObjectId(creatorId),
      type: EmailCampaignType.WELCOME,
      status: EmailCampaignStatus.SENT, // templates are always "active", not in send queue
      isHtml: dto.isHtml ?? false,
      isAutomationTemplate: true,
      eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
      automationActive: dto.automationActive ?? true,
      recipients: [],
      totalRecipients: 0,
      trackOpens: true,
      trackClicks: true,
      metadata: { communityName: community.name, automationTemplateType: 'WELCOME' },
    });

    const saved = await template.save();
    this.logger.log(`Created welcome template ${saved._id.toString()} for community ${communityId}`);
    return saved;
  }

  async getWelcomeTemplate(
    creatorId: string,
    communityId: string,
  ): Promise<EmailCampaignDocument | null> {
    await this.verifyCommunityAccess(creatorId, communityId);
    return this.emailCampaignModel
      .findOne({
        communityId: new Types.ObjectId(communityId),
        isAutomationTemplate: true,
        eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
        automationActive: true,
      })
      .exec();
  }

  async updateWelcomeTemplate(
    creatorId: string,
    communityId: string,
    dto: UpdateWelcomeTemplateDto,
  ): Promise<EmailCampaignDocument> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const template = await this.emailCampaignModel
      .findOne({
        communityId: new Types.ObjectId(communityId),
        isAutomationTemplate: true,
        eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
      })
      .exec();

    if (!template) {
      throw new NotFoundException('Welcome template not found. Create one first.');
    }

    if (dto.subject !== undefined) template.subject = dto.subject;
    if (dto.content !== undefined) template.content = dto.content;
    if (dto.isHtml !== undefined) template.isHtml = dto.isHtml;

    return template.save();
  }

  async deleteWelcomeTemplate(creatorId: string, communityId: string): Promise<void> {
    await this.verifyCommunityAccess(creatorId, communityId);
    const result = await this.emailCampaignModel
      .deleteOne({
        communityId: new Types.ObjectId(communityId),
        isAutomationTemplate: true,
        eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Welcome template not found');
    }
  }

  async toggleWelcomeTemplate(creatorId: string, communityId: string, active: boolean): Promise<EmailCampaignDocument> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const template = await this.emailCampaignModel
      .findOne({
        communityId: new Types.ObjectId(communityId),
        isAutomationTemplate: true,
        eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
      })
      .exec();

    if (!template) {
      throw new NotFoundException('Welcome template not found. Create one first.');
    }

    template.automationActive = active;
    return template.save();
  }

  /**
   * Called by the community-join service whenever a user successfully joins a community.
   * Finds the community's active welcome template and sends it immediately.
   */
  async sendWelcomeEmailToNewMember(userId: string, communityId: string): Promise<void> {    try {
      const template = await this.emailCampaignModel
        .findOne({
          communityId: new Types.ObjectId(communityId),
          isAutomationTemplate: true,
          eventTrigger: AutomationEventTrigger.COMMUNITY_JOIN,
          automationActive: true,
        })
        .lean()
        .exec();

      if (!template) return; // no welcome email configured

      const user = await this.userModel.findById(userId).select('email name').lean().exec();
      if (!user?.email) return;

      const community = await this.communityModel.findById(communityId).select('name').lean().exec();
      const communityName = community?.name || '';

      const variables = this.buildBaseVariables({
        recipientName: user.name || user.email,
        communityName,
        targetDaysThreshold: undefined,
        targetInactivityPeriod: undefined,
        contentType: undefined,
      });

      const renderedSubject = renderTemplate(template.subject, variables);
      const renderedContent = renderTemplate(template.content, variables);

      await this.emailService.sendGenericEmail({
        to: user.email,
        subject: renderedSubject,
        text: template.isHtml ? '' : renderedContent,
        html: template.isHtml ? renderedContent : undefined,
      });

      // Track this delivery by adding the recipient to the template document
      await this.emailCampaignModel
        .updateOne(
          { _id: template._id },
          {
            $push: {
              recipients: {
                userId: new Types.ObjectId(userId),
                email: user.email,
                name: user.name || user.email,
                status: 'sent',
                sentAt: new Date(),
                opened: false,
                clickCount: 0,
              },
            },
            $inc: { sentCount: 1, totalRecipients: 1 },
          },
        )
        .exec();

      this.logger.log(`Welcome email sent to ${user.email} for community ${communityId}`);
    } catch (err: any) {
      // Never throw — welcome email failure must not break the join flow
      this.logger.error(`Failed to send welcome email to user ${userId}: ${err?.message || err}`);
    }
  }

  // ─── Daily Inactivity Automation ────────────────────────────────────────────

  /**
   * Creates a continuous inactivity automation — a "set-and-forget" campaign that
   * automatically sends the provided email to any member who has been inactive for
   * exactly `minInactiveDays` days (checked daily at 08:00 server time).
   * The system prevents re-sending to the same user within 30 days.
   */
  async createInactivityAutomation(
    creatorId: string,
    dto: {
      communityId: string;
      title: string;
      subject: string;
      content: string;
      minInactiveDays: number;
      isHtml?: boolean;
    },
  ): Promise<EmailCampaignDocument> {
    const community = await this.verifyCommunityAccess(creatorId, dto.communityId);

    if (dto.minInactiveDays < 1) {
      throw new BadRequestException('minInactiveDays must be at least 1');
    }

    // Deactivate existing automation for the same threshold in this community
    await this.emailCampaignModel
      .updateMany(
        {
          communityId: new Types.ObjectId(dto.communityId),
          isInactiveUserCampaign: true,
          'metadata.automationSource': 'daily_inactivity',
          'metadata.minInactiveDays': dto.minInactiveDays,
        },
        { $set: { 'metadata.automationActive': false } },
      )
      .exec();

    const automation = new this.emailCampaignModel({
      title: dto.title,
      subject: dto.subject,
      content: dto.content,
      communityId: new Types.ObjectId(dto.communityId),
      creatorId: new Types.ObjectId(creatorId),
      type: EmailCampaignType.INACTIVE_USER_REACTIVATION,
      status: EmailCampaignStatus.DRAFT, // never enters the send queue — cron handles it
      isHtml: dto.isHtml ?? false,
      isInactiveUserCampaign: true,
      targetDaysThreshold: dto.minInactiveDays,
      recipients: [],
      totalRecipients: 0,
      sentCount: 0,
      trackOpens: true,
      trackClicks: true,
      metadata: {
        communityName: community.name,
        automationSource: 'daily_inactivity',
        automationActive: true,
        minInactiveDays: dto.minInactiveDays,
      },
    });

    const saved = await automation.save();
    this.logger.log(
      `Created inactivity automation ${saved._id.toString()} for community ${dto.communityId} — triggers at ${dto.minInactiveDays}d inactive`,
    );
    return saved;
  }

  async toggleInactivityAutomation(automationId: string, creatorId: string, active: boolean): Promise<EmailCampaignDocument> {
    const automation = await this.emailCampaignModel.findById(automationId).exec();
    if (!automation) throw new NotFoundException('Inactivity automation not found');
    if (!automation.creatorId.equals(creatorId)) throw new ForbiddenException('Not your automation');
    if (automation.metadata?.automationSource !== 'daily_inactivity') {
      throw new BadRequestException('Not an inactivity automation');
    }
    automation.metadata = { ...automation.metadata, automationActive: active };
    return automation.save();
  }

  async getInactivityAutomations(creatorId: string, communityId: string): Promise<EmailCampaignDocument[]> {
    await this.verifyCommunityAccess(creatorId, communityId);
    return this.emailCampaignModel
      .find({
        communityId: new Types.ObjectId(communityId),
        isInactiveUserCampaign: true,
        'metadata.automationSource': 'daily_inactivity',
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Called once per day by the cron processor.
   * Finds all communities where the creator has stored an automated inactivity
   * campaign template (identified by metadata.automationSource === 'daily_inactivity'),
   * resolves newly-qualifying inactive users that have NOT already been sent this
   * email in the last 30 days, and sends them the email immediately.
   */
  async runDailyInactivityAutomations(): Promise<void> {    // Find all automation-enabled inactivity campaigns across all communities
    const automations = await this.emailCampaignModel
      .find({
        isInactiveUserCampaign: true,
        'metadata.automationSource': 'daily_inactivity',
        'metadata.automationActive': true,
      })
      .lean()
      .exec();

    this.logger.log(`Found ${automations.length} daily inactivity automation(s) to process`);

    for (const automation of automations) {
      try {
        const minInactiveDays = automation.metadata?.minInactiveDays as number;
        if (!minInactiveDays || minInactiveDays < 1) continue;

        const cutoff = new Date(Date.now() - minInactiveDays * 24 * 60 * 60 * 1000);
        const recentEmailCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const communityId = automation.communityId;

        // Get inactive users that crossed the threshold today (within a 24-hour window)
        const yesterdayCutoff = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);

        const activities = await this.userLoginActivityModel
          .find({
            communityId,
            lastLoginAt: { $gte: yesterdayCutoff, $lt: cutoff },
          })
          .populate('userId', 'email name')
          .lean()
          .exec();

        const community = await this.communityModel.findById(communityId).select('name').lean().exec();
        const communityName = community?.name || '';

        for (const activity of activities) {
          const user = activity.userId as any;
          if (!user?.email) continue;

          // Skip if we've emailed this user from THIS automation within the last 30 days
          const alreadySent = automation.recipients?.some(
            (r: any) =>
              String(r.userId) === String(user._id) &&
              r.sentAt &&
              new Date(r.sentAt) > recentEmailCutoff,
          );
          if (alreadySent) continue;

          const variables = this.buildBaseVariables({
            recipientName: user.name || user.email,
            communityName,
            targetDaysThreshold: minInactiveDays,
            targetInactivityPeriod: undefined,
            contentType: undefined,
          });

          const renderedSubject = renderTemplate(automation.subject, variables);
          const renderedContent = renderTemplate(automation.content, variables);

          try {
            await this.emailService.sendGenericEmail({
              to: user.email,
              subject: renderedSubject,
              text: automation.isHtml ? '' : renderedContent,
              html: automation.isHtml ? renderedContent : undefined,
            });

            // Record delivery
            await this.emailCampaignModel
              .updateOne(
                { _id: automation._id },
                {
                  $push: {
                    recipients: {
                      userId: user._id,
                      email: user.email,
                      name: user.name || user.email,
                      status: 'sent',
                      sentAt: new Date(),
                      opened: false,
                      clickCount: 0,
                    },
                  },
                  $inc: { sentCount: 1, totalRecipients: 1 },
                },
              )
              .exec();

            this.logger.debug(`Inactivity automation email sent to ${user.email} (inactive ${minInactiveDays}d)`);
          } catch (sendErr: any) {
            this.logger.warn(`Failed to send inactivity automation to ${user.email}: ${sendErr?.message}`);
          }
        }
      } catch (automationErr: any) {
        this.logger.error(`Error in daily inactivity automation ${String(automation._id)}: ${automationErr?.message}`);
      }
    }
  }

  async sendCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<{ queued: true; campaignId: string; message: string }> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only send campaigns you created');
    }
    const hasFailedRecipients = campaign.recipients.some((recipient) => recipient.status === 'failed');
    const canRetryFailedCampaign =
      campaign.status === EmailCampaignStatus.FAILED ||
      (campaign.status === EmailCampaignStatus.SENT && hasFailedRecipients);

    if (campaign.status === EmailCampaignStatus.SENDING) {
      return {
        queued: true,
        campaignId,
        message: 'Campaign is already being sent',
      };
    }

    if (campaign.status === EmailCampaignStatus.SENT && !hasFailedRecipients) {
      return {
        queued: true,
        campaignId,
        message: 'Campaign has already been sent successfully',
      };
    }

    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED &&
      !canRetryFailedCampaign
    ) {
      throw new BadRequestException('Campaign cannot be sent in current status');
    }

    if (canRetryFailedCampaign) {
      campaign.recipients.forEach((recipient) => {
        if (recipient.status === 'failed') {
          recipient.status = 'pending';
          recipient.errorMessage = undefined;
          recipient.sentAt = undefined;
        }
      });
      campaign.failedCount = 0;
    }

    campaign.metadata = {
      ...(campaign.metadata || {}),
      queueError: undefined,
      queueFailedAt: undefined,
    };
    campaign.status = EmailCampaignStatus.DRAFT;
    campaign.scheduledAt = undefined;
    campaign.sentAt = undefined;
    await campaign.save();

    await this.emailCampaignQueueService.queueCampaignSend({
      campaignId,
      requestedBy: creatorId,
      trigger: 'manual',
    });

    return {
      queued: true,
      campaignId,
      message: 'Campaign queued for sending',
    };
  }

  async executeSendCampaignJob(payload: EmailCampaignSendJobPayload): Promise<void> {
    const { campaignId } = payload;
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();

    if (!campaign) {
      this.logger.warn(`Skipping send job for missing campaign ${campaignId}`);
      return;
    }

    if (campaign.status === EmailCampaignStatus.CANCELLED || campaign.status === EmailCampaignStatus.SENT) {
      this.logger.log(`Skipping campaign ${campaignId} with status ${campaign.status}`);
      return;
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED &&
      campaign.status !== EmailCampaignStatus.SENDING
    ) {
      this.logger.warn(`Campaign ${campaignId} has unsupported status ${campaign.status}`);
      return;
    }

    const community = await this.communityModel.findById(campaign.communityId).select('name').lean().exec();
    const communityName = community?.name || '';

    if (campaign.status !== EmailCampaignStatus.SENDING) {
      campaign.status = EmailCampaignStatus.SENDING;
      await this.emailCampaignModel
        .updateOne({ _id: campaign._id }, { $set: { status: EmailCampaignStatus.SENDING } })
        .exec();
    } else {
      this.logger.warn(`Resuming campaign ${campaignId} that was already in sending state`);
    }

    const recipientsToProcess = campaign.recipients.filter((recipient) => recipient.status !== 'sent');
    if (recipientsToProcess.length === 0) {
      campaign.sentCount = campaign.recipients.filter((recipient) => recipient.status === 'sent').length;
      campaign.failedCount = campaign.recipients.filter((recipient) => recipient.status === 'failed').length;
      campaign.status = campaign.failedCount > 0 ? EmailCampaignStatus.FAILED : EmailCampaignStatus.SENT;
      campaign.sentAt = new Date();
      await this.persistCampaignSendState(campaign);
      return;
    }

    const batchSize = 10;
    const batches = this.chunkArray(recipientsToProcess, batchSize);
    let authenticationFailureMessage: string | null = null;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const results = await Promise.all(
        batch.map((recipient) => this.sendEmailToRecipient(campaign, recipient, communityName)),
      );
      const authFailureInBatch = results.some((result) => result.authenticationFailure);
      if (authFailureInBatch) {
        authenticationFailureMessage =
          campaign.recipients.find((recipient) => recipient.status === 'failed')?.errorMessage ||
          'SMTP authentication failed';
        break;
      }

      if (index < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (authenticationFailureMessage) {
      const failureMessage = authenticationFailureMessage;
      campaign.recipients
        .filter((recipient) => recipient.status === 'pending')
        .forEach((recipient) => {
          recipient.status = 'failed';
          recipient.errorMessage = failureMessage;
        });
      this.logger.error(
        `Campaign ${campaign._id.toString()} aborted due to SMTP auth failure: ${authenticationFailureMessage}`,
      );
    }

    campaign.sentCount = campaign.recipients.filter((recipient) => recipient.status === 'sent').length;
    campaign.failedCount = campaign.recipients.filter((recipient) => recipient.status === 'failed').length;
    campaign.sentAt = new Date();
    campaign.status =
      campaign.sentCount > 0 ? EmailCampaignStatus.SENT : EmailCampaignStatus.FAILED;
    await this.persistCampaignSendState(campaign);

    if (campaign.isInactiveUserCampaign) {
      await this.updateReactivationEmailTracking(campaign);
    }
  }

  async markCampaignSendFailed(campaignId: string, errorMessage: string): Promise<void> {
    await this.emailCampaignModel
      .updateOne(
        {
          _id: campaignId,
          status: { $nin: [EmailCampaignStatus.SENT, EmailCampaignStatus.CANCELLED] },
        },
        {
          $set: {
            status: EmailCampaignStatus.FAILED,
            'metadata.queueError': errorMessage,
            'metadata.queueFailedAt': new Date().toISOString(),
            sentAt: new Date(),
          },
        },
      )
      .exec();
  }

  async getCommunityCampaigns(
    creatorId: string,
    communityId: string,
    query: EmailCampaignQueryDto,
  ): Promise<{ campaigns: EmailCampaignDocument[]; total: number; page: number; limit: number }> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const filter: Record<string, any> = {
      communityId: new Types.ObjectId(communityId),
    };

    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.inactiveUserCampaigns !== undefined) {
      filter.isInactiveUserCampaign = query.inactiveUserCampaigns;
    }
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { subject: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      this.emailCampaignModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('creatorId', 'name email')
        .exec(),
      this.emailCampaignModel.countDocuments(filter).exec(),
    ]);

    return { campaigns, total, page, limit };
  }

  async getCampaignStats(creatorId: string, communityId: string): Promise<CampaignStatsDto> {
    await this.verifyCommunityAccess(creatorId, communityId);

    const campaigns = await this.emailCampaignModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .lean()
      .exec();

    const totalCampaigns = campaigns.length;
    const totalEmailsSent = campaigns.reduce((sum, campaign) => sum + (campaign.sentCount || 0), 0);
    const totalEmailsFailed = campaigns.reduce((sum, campaign) => sum + (campaign.failedCount || 0), 0);
    const totalOpens = campaigns.reduce((sum, campaign) => sum + (campaign.openCount || 0), 0);
    const totalClicks = campaigns.reduce((sum, campaign) => sum + (campaign.clickCount || 0), 0);
    const totalUniqueClicks = campaigns.reduce(
      (sum, campaign) =>
        sum + (Array.isArray(campaign.recipients) ? campaign.recipients.filter((recipient) => (recipient?.clickCount || 0) > 0).length : 0),
      0,
    );

    const reactivationCampaigns = campaigns.filter((campaign) => campaign.isInactiveUserCampaign).length;
    const reactivationSent = campaigns
      .filter((campaign) => campaign.isInactiveUserCampaign)
      .reduce((sum, campaign) => sum + (campaign.sentCount || 0), 0);
    const reactivationOpens = campaigns
      .filter((campaign) => campaign.isInactiveUserCampaign)
      .reduce((sum, campaign) => sum + (campaign.openCount || 0), 0);

    return {
      totalCampaigns,
      totalEmailsSent,
      totalEmailsFailed,
      totalOpens,
      totalClicks,
      averageOpenRate: totalEmailsSent > 0 ? (totalOpens / totalEmailsSent) * 100 : 0,
      averageClickRate: totalEmailsSent > 0 ? (totalUniqueClicks / totalEmailsSent) * 100 : 0,
      reactivationCampaigns,
      reactivationSuccessRate: reactivationSent > 0 ? (reactivationOpens / reactivationSent) * 100 : 0,
    };
  }

  async getInactiveUsers(
    creatorId: string,
    communityId: string,
    query: InactiveUserQueryDto,
  ): Promise<UserLoginActivityDocument[]> {
    await this.verifyCommunityAccess(creatorId, communityId);
    const limit = query.limit || 100;
    if (query.period) {
      return this.userLoginActivityService.getInactiveUsersByPeriod(communityId, query.period, limit);
    }
    return this.userLoginActivityService.getAllInactiveUsers(communityId, limit);
  }

  async getInactiveUserStats(creatorId: string, communityId: string): Promise<InactiveUserStatsDto> {
    await this.verifyCommunityAccess(creatorId, communityId);
    return this.userLoginActivityService.getInactivityStats(communityId);
  }

  async getCampaign(campaignId: string, creatorId: string): Promise<EmailCampaignDocument> {
    const campaign = await this.emailCampaignModel
      .findById(campaignId)
      .populate('creatorId', 'name email')
      .exec();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    await this.verifyCommunityAccess(creatorId, campaign.communityId.toString());
    return campaign;
  }

  async updateCampaign(
    campaignId: string,
    dto: UpdateEmailCampaignDto,
    creatorId: string,
  ): Promise<EmailCampaignDocument> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only update campaigns you created');
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be updated in current status');
    }

    if (dto.title !== undefined) campaign.title = dto.title;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.content !== undefined) campaign.content = dto.content;
    if (dto.isHtml !== undefined) campaign.isHtml = dto.isHtml;
    if (dto.trackOpens !== undefined) campaign.trackOpens = dto.trackOpens;
    if (dto.trackClicks !== undefined) campaign.trackClicks = dto.trackClicks;
    if (dto.metadata !== undefined) campaign.metadata = dto.metadata;

    if (dto.scheduledAt !== undefined) {
      campaign.scheduledAt = this.normalizeScheduledAt(dto.scheduledAt);
      campaign.status = this.resolveCampaignStatus(campaign.scheduledAt);
    } else if (dto.status === EmailCampaignStatus.DRAFT) {
      campaign.status = EmailCampaignStatus.DRAFT;
      campaign.scheduledAt = undefined;
    } else if (dto.status === EmailCampaignStatus.SCHEDULED) {
      if (!campaign.scheduledAt) {
        throw new BadRequestException('scheduledAt is required when setting status to scheduled');
      }
      campaign.status = EmailCampaignStatus.SCHEDULED;
    }

    const updatedCampaign = await campaign.save();

    if (updatedCampaign.status === EmailCampaignStatus.SCHEDULED && updatedCampaign.scheduledAt) {
      await this.emailCampaignQueueService.queueCampaignSend(
        {
          campaignId: updatedCampaign._id.toString(),
          requestedBy: creatorId,
          trigger: 'scheduled',
        },
        updatedCampaign.scheduledAt,
      );
    } else {
      await this.emailCampaignQueueService.removeScheduledCampaignSend(updatedCampaign._id.toString());
    }

    await updatedCampaign.populate('creatorId', 'name email');
    return updatedCampaign;
  }

  async deleteCampaign(campaignId: string, creatorId: string): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only delete campaigns you created');
    }
    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be deleted in current status');
    }

    await this.emailCampaignQueueService.removeScheduledCampaignSend(campaignId);
    await this.emailCampaignModel.deleteOne({ _id: campaignId }).exec();
  }

  async cancelCampaign(campaignId: string, creatorId: string): Promise<void> {
    const campaign = await this.emailCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!campaign.creatorId.equals(creatorId)) {
      throw new ForbiddenException('You can only cancel campaigns you created');
    }
    if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled campaigns can be cancelled');
    }

    campaign.status = EmailCampaignStatus.CANCELLED;
    await campaign.save();
    await this.emailCampaignQueueService.removeScheduledCampaignSend(campaignId);
  }

  async duplicateCampaign(
    campaignId: string,
    creatorId: string,
    newTitle?: string,
  ): Promise<EmailCampaignDocument> {
    const source = await this.emailCampaignModel.findById(campaignId).exec();
    if (!source) {
      throw new NotFoundException('Campaign not found');
    }
    await this.verifyCommunityAccess(creatorId, source.communityId.toString());

    const community = await this.communityModel.findById(source.communityId).exec();
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    const recipients = await this.buildCommunityRecipients(community);

    const duplicate = new this.emailCampaignModel({
      title: newTitle || `Copy of ${source.title}`,
      subject: source.subject,
      content: source.content,
      communityId: source.communityId,
      creatorId: new Types.ObjectId(creatorId),
      recipients,
      totalRecipients: recipients.length,
      type: source.type,
      isHtml: source.isHtml,
      trackOpens: source.trackOpens,
      trackClicks: source.trackClicks,
      metadata: source.metadata || {},
      status: EmailCampaignStatus.DRAFT,
    });

    return duplicate.save();
  }

  async getCampaignRecipients(
    campaignId: string,
    creatorId: string,
    query: RecipientsQuery,
  ): Promise<{ recipients: any[]; total: number; page: number; limit: number }> {
    const campaign = await this.getCampaign(campaignId, creatorId);

    let recipients = campaign.recipients.slice();
    if (query.status) recipients = recipients.filter((recipient) => recipient.status === query.status);
    if (query.opened !== undefined) recipients = recipients.filter((recipient) => recipient.opened === query.opened);

    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const start = (page - 1) * limit;
    const paged = recipients.slice(start, start + limit).map((recipient) => ({
      userId: recipient.userId,
      email: recipient.email,
      name: recipient.name,
      status: recipient.status,
      sentAt: recipient.sentAt,
      opened: recipient.opened,
      openedAt: recipient.openedAt,
      clickCount: recipient.clickCount,
      clickedAt: recipient.clickedAt,
      errorMessage: recipient.errorMessage,
    }));

    return {
      recipients: paged,
      total: recipients.length,
      page,
      limit,
    };
  }

  async sendTestEmail(
    toEmail: string,
    subject: string,
    content: string,
    communityId?: string,
    isHtml = false,
  ): Promise<void> {
    let communityName = '';
    if (communityId && Types.ObjectId.isValid(communityId)) {
      const community = await this.communityModel.findById(communityId).select('name').lean().exec();
      communityName = community?.name || '';
    }

    const variables = this.buildBaseVariables({
      recipientName: 'Test User',
      communityName,
      targetDaysThreshold: undefined,
      targetInactivityPeriod: undefined,
      contentType: undefined,
    });

    const processedSubject = renderTemplate(subject, variables);
    const processedContent = renderTemplate(content, variables);

    await this.emailService.sendGenericEmail({
      to: toEmail,
      subject: processedSubject,
      text: isHtml ? '' : processedContent,
      html: isHtml ? processedContent : undefined,
    });
  }

  async recordOpenByToken(token?: string): Promise<boolean> {
    const payload = this.parseTrackingToken(token, 'open');
    if (!payload) return false;

    const recipientObjectId = this.parseRecipientObjectId(payload.recipientUserId);
    if (!recipientObjectId) return false;

    const now = new Date();
    await this.emailCampaignModel
      .updateOne(
        {
          _id: payload.campaignId,
          trackOpens: { $ne: false },
          recipients: {
            $elemMatch: {
              userId: recipientObjectId,
              email: payload.recipientEmail,
              opened: false,
            },
          },
        },
        {
          $set: {
            'recipients.$.opened': true,
            'recipients.$.openedAt': now,
          },
          $inc: {
            openCount: 1,
          },
        },
      )
      .exec();

    const recipientExists = await this.emailCampaignModel
      .exists({
        _id: payload.campaignId,
        trackOpens: { $ne: false },
        recipients: {
          $elemMatch: {
            userId: recipientObjectId,
            email: payload.recipientEmail,
          },
        },
      })
      .exec();

    return Boolean(recipientExists);
  }

  async recordClickByToken(token?: string): Promise<string> {
    const fallbackUrl = this.getInvalidClickRedirectUrl();
    const payload = this.parseTrackingToken(token, 'click');
    if (!payload || !payload.url) return fallbackUrl;

    const recipientObjectId = this.parseRecipientObjectId(payload.recipientUserId);
    if (!recipientObjectId) return fallbackUrl;

    const now = new Date();
    await this.emailCampaignModel
      .updateOne(
        {
          _id: payload.campaignId,
          trackClicks: { $ne: false },
          recipients: {
            $elemMatch: {
              userId: recipientObjectId,
              email: payload.recipientEmail,
            },
          },
        },
        {
          $inc: {
            'recipients.$.clickCount': 1,
            clickCount: 1,
          },
          $push: {
            'recipients.$.clickedAt': now,
          },
        },
      )
      .exec();

    // A click implies an open if open tracking is enabled.
    await this.emailCampaignModel
      .updateOne(
        {
          _id: payload.campaignId,
          trackOpens: { $ne: false },
          recipients: {
            $elemMatch: {
              userId: recipientObjectId,
              email: payload.recipientEmail,
              opened: false,
            },
          },
        },
        {
          $set: {
            'recipients.$.opened': true,
            'recipients.$.openedAt': now,
          },
          $inc: {
            openCount: 1,
          },
        },
      )
      .exec();

    return payload.url;
  }

  getOpenTrackingPixel(): Buffer {
    return TRANSPARENT_GIF_BUFFER;
  }

  private async verifyCommunityAccess(creatorId: string, communityId: string): Promise<CommunityDocument> {
    const community = await this.communityModel
      .findOne({
        _id: new Types.ObjectId(communityId),
        $or: [
          { createur: new Types.ObjectId(creatorId) },
          { admins: new Types.ObjectId(creatorId) },
        ],
      })
      .exec();

    if (!community) {
      throw new ForbiddenException('You can only manage campaigns for communities you own or admin');
    }
    return community;
  }

  private async buildCommunityRecipients(community: CommunityDocument): Promise<EmailRecipient[]> {
    const members = await this.userModel
      .find({ _id: { $in: community.members } })
      .select('_id email name')
      .lean()
      .exec();

    return members.map((member) => ({
      userId: member._id as any,
      email: member.email,
      name: member.name,
      status: 'pending',
      opened: false,
      clickCount: 0,
    }));
  }

  private async getInactiveUsersForCampaign(
    dto: CreateInactiveUserCampaignDto,
  ): Promise<UserLoginActivityDocument[]> {
    const limit = dto.maxRecipients || 1000;
    if (dto.targetAllInactive) {
      return this.userLoginActivityService.getAllInactiveUsers(dto.communityId, limit);
    }
    return this.userLoginActivityService.getInactiveUsersByPeriod(
      dto.communityId,
      dto.inactivityPeriod,
      limit,
    );
  }

  private normalizeScheduledAt(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid scheduledAt value');
    }
    return parsed.getTime() > Date.now() ? parsed : undefined;
  }

  private resolveCampaignStatus(scheduledAt?: Date): EmailCampaignStatus {
    return scheduledAt ? EmailCampaignStatus.SCHEDULED : EmailCampaignStatus.DRAFT;
  }

  private async enqueueIfScheduled(
    campaign: EmailCampaignDocument,
    creatorId: string,
    trigger: EmailCampaignSendJobPayload['trigger'],
  ): Promise<void> {
    if (campaign.status !== EmailCampaignStatus.SCHEDULED || !campaign.scheduledAt) return;
    await this.emailCampaignQueueService.queueCampaignSend(
      {
        campaignId: campaign._id.toString(),
        requestedBy: creatorId,
        trigger,
      },
      campaign.scheduledAt,
    );
  }

  private async sendEmailToRecipient(
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
    communityName: string,
  ): Promise<SendRecipientResult> {
    const variables = this.buildBaseVariables({
      recipientName: recipient.name,
      communityName,
      targetDaysThreshold: campaign.targetDaysThreshold,
      targetInactivityPeriod: campaign.targetInactivityPeriod,
      contentType: String(campaign.metadata?.contentType || ''),
    });

    const subject = renderTemplate(campaign.subject, variables);
    const content = renderTemplate(campaign.content, variables);
    const trackedContent = this.buildTrackedRecipientContent(campaign, recipient, content);

    try {
      await this.emailService.sendGenericEmail({
        to: recipient.email,
        subject,
        text: trackedContent.text,
        html: trackedContent.html,
      });

      recipient.status = 'sent';
      recipient.sentAt = new Date();
      recipient.errorMessage = undefined;
      recipient.personalizedSubject = subject;
      recipient.personalizedContent = content;
      return { authenticationFailure: false };
    } catch (error) {
      recipient.status = 'failed';
      recipient.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      recipient.personalizedSubject = subject;
      recipient.personalizedContent = content;
      this.logger.error(
        `Failed sending campaign ${campaign._id.toString()} to ${recipient.email}: ${recipient.errorMessage}`,
      );
      return {
        authenticationFailure: this.emailService.isAuthenticationFailureError(error),
      };
    }
  }

  private buildTrackedRecipientContent(
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
    content: string,
  ): { text: string; html?: string } {
    const trackClicks = campaign.trackClicks !== false;
    const trackOpens = campaign.trackOpens !== false;

    if (campaign.isHtml) {
      let trackedHtml = content;
      if (trackClicks) {
        trackedHtml = this.rewriteHtmlLinksWithTracking(trackedHtml, campaign, recipient);
      }
      if (trackOpens) {
        const openTrackingUrl = this.buildOpenTrackingUrl(campaign, recipient);
        trackedHtml = this.injectOpenTrackingPixel(trackedHtml, openTrackingUrl);
      }
      return { text: '', html: trackedHtml };
    }

    const trackedText = trackClicks
      ? this.rewritePlainTextLinksWithTracking(content, campaign, recipient)
      : content;

    let trackedHtml = this.renderPlainTextAsHtml(trackedText);
    if (trackOpens) {
      const openTrackingUrl = this.buildOpenTrackingUrl(campaign, recipient);
      trackedHtml = this.injectOpenTrackingPixel(trackedHtml, openTrackingUrl);
    }

    return { text: trackedText, html: trackedHtml };
  }

  private rewriteHtmlLinksWithTracking(
    html: string,
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
  ): string {
    return html.replace(/href=(["'])(https?:\/\/[^"'<>\s]+)\1/gi, (match, quote, rawUrl) => {
      const destination = this.normalizeTrackingDestination(rawUrl);
      if (!destination) return match;
      const trackedUrl = this.buildClickTrackingUrl(campaign, recipient, destination);
      return `href=${quote}${trackedUrl}${quote}`;
    });
  }

  private rewritePlainTextLinksWithTracking(
    text: string,
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
  ): string {
    return text.replace(/https?:\/\/[^\s<>"')\]]+/gi, (rawUrl) => {
      const trimmedUrl = rawUrl.replace(/[.,!?;:]+$/, '');
      const suffix = rawUrl.slice(trimmedUrl.length);
      const destination = this.normalizeTrackingDestination(trimmedUrl);
      if (!destination) return rawUrl;
      const trackedUrl = this.buildClickTrackingUrl(campaign, recipient, destination);
      return `${trackedUrl}${suffix}`;
    });
  }

  private injectOpenTrackingPixel(html: string, openTrackingUrl: string): string {
    const pixelTag =
      `<img src="${openTrackingUrl}" alt="" width="1" height="1" ` +
      `style="display:none;max-width:0;max-height:0;opacity:0;overflow:hidden;" />`;
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${pixelTag}</body>`);
    }
    return `${html}${pixelTag}`;
  }

  private renderPlainTextAsHtml(content: string): string {
    return `<p style="margin:0;">${this.escapeHtml(content).replace(/\n/g, '<br/>')}</p>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildOpenTrackingUrl(campaign: EmailCampaignDocument, recipient: EmailRecipient): string {
    const token = this.signTrackingPayload({
      v: 1,
      type: 'open',
      campaignId: campaign._id.toString(),
      recipientUserId: recipient.userId.toString(),
      recipientEmail: recipient.email,
      exp: Date.now() + TRACKING_TOKEN_TTL_MS,
    });
    return `${this.getTrackingBaseUrl()}/open?t=${encodeURIComponent(token)}`;
  }

  private buildClickTrackingUrl(
    campaign: EmailCampaignDocument,
    recipient: EmailRecipient,
    destinationUrl: string,
  ): string {
    const token = this.signTrackingPayload({
      v: 1,
      type: 'click',
      campaignId: campaign._id.toString(),
      recipientUserId: recipient.userId.toString(),
      recipientEmail: recipient.email,
      exp: Date.now() + TRACKING_TOKEN_TTL_MS,
      url: destinationUrl,
    });
    return `${this.getTrackingBaseUrl()}/click?t=${encodeURIComponent(token)}`;
  }

  private getTrackingBaseUrl(): string {
    const serverBase = (process.env.SERVER_URL || 'https://api.chabaqa.io').trim().replace(/\/+$/, '');
    return `${serverBase}/api/email-campaigns/track`;
  }

  private signTrackingPayload(payload: TrackingTokenPayload): string {
    const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.signTrackingPayloadPart(payloadPart);
    return `${payloadPart}.${signature}`;
  }

  private parseTrackingToken(token: string | undefined, expectedType: TrackingEventType): TrackingTokenPayload | null {
    if (!token) return null;

    const [payloadPart, signature] = token.split('.');
    if (!payloadPart || !signature) return null;

    const expectedSignature = this.signTrackingPayloadPart(payloadPart);
    if (!this.safeTokenCompare(signature, expectedSignature)) return null;

    let payload: TrackingTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as TrackingTokenPayload;
    } catch {
      return null;
    }

    if (
      payload.v !== 1 ||
      payload.type !== expectedType ||
      !payload.campaignId ||
      !payload.recipientUserId ||
      !payload.recipientEmail ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    if (payload.exp <= Date.now()) return null;

    if (payload.type === 'click') {
      const normalizedDestination = this.normalizeTrackingDestination(payload.url || '');
      if (!normalizedDestination) return null;
      payload.url = normalizedDestination;
    }

    return payload;
  }

  private signTrackingPayloadPart(payloadPart: string): string {
    return createHmac('sha256', this.getTrackingSecret())
      .update(payloadPart)
      .digest('base64url');
  }

  private getTrackingSecret(): string {
    const secret =
      process.env.EMAIL_TRACKING_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      DEFAULT_TRACKING_SECRET;
    return secret;
  }

  private safeTokenCompare(tokenA: string, tokenB: string): boolean {
    const first = Buffer.from(tokenA);
    const second = Buffer.from(tokenB);
    if (first.length !== second.length) return false;
    return timingSafeEqual(first, second);
  }

  private normalizeTrackingDestination(rawUrl: string): string | null {
    if (!rawUrl) return null;
    const decoded = rawUrl.replace(/&amp;/gi, '&');
    try {
      const parsed = new URL(decoded);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private parseRecipientObjectId(value: string): Types.ObjectId | null {
    if (!Types.ObjectId.isValid(value)) return null;
    return new Types.ObjectId(value);
  }

  private async persistCampaignSendState(campaign: EmailCampaignDocument): Promise<void> {
    const setOps: Record<string, any> = {
      status: campaign.status,
      sentAt: campaign.sentAt || new Date(),
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
    };
    const unsetOps: Record<string, 1> = {};

    campaign.recipients.forEach((recipient, index) => {
      setOps[`recipients.${index}.status`] = recipient.status;

      if (recipient.sentAt) {
        setOps[`recipients.${index}.sentAt`] = recipient.sentAt;
      } else {
        unsetOps[`recipients.${index}.sentAt`] = 1;
      }

      if (recipient.errorMessage) {
        setOps[`recipients.${index}.errorMessage`] = recipient.errorMessage;
      } else {
        unsetOps[`recipients.${index}.errorMessage`] = 1;
      }

      if (recipient.personalizedSubject) {
        setOps[`recipients.${index}.personalizedSubject`] = recipient.personalizedSubject;
      } else {
        unsetOps[`recipients.${index}.personalizedSubject`] = 1;
      }

      if (recipient.personalizedContent) {
        setOps[`recipients.${index}.personalizedContent`] = recipient.personalizedContent;
      } else {
        unsetOps[`recipients.${index}.personalizedContent`] = 1;
      }
    });

    const updateOps: Record<string, any> = { $set: setOps };
    if (Object.keys(unsetOps).length > 0) {
      updateOps.$unset = unsetOps;
    }

    await this.emailCampaignModel.updateOne({ _id: campaign._id }, updateOps).exec();
  }

  private getInvalidClickRedirectUrl(): string {
    return (process.env.FRONTEND_URL || 'https://chabaqa.io').trim().replace(/\/+$/, '');
  }

  private buildBaseVariables(input: {
    recipientName: string;
    communityName: string;
    targetDaysThreshold?: number;
    targetInactivityPeriod?: InactivityPeriod;
    contentType?: string;
  }): Record<string, string | number> {
    const now = new Date();
    const contentType = input.contentType || '';
    return {
      userName: input.recipientName || '',
      communityName: input.communityName || '',
      currentDate: now.toISOString().slice(0, 10),
      currentYear: now.getUTCFullYear(),
      daysThreshold: input.targetDaysThreshold || '',
      inactivityPeriod: inactivityPeriodToText(input.targetInactivityPeriod),
      contentType,
      contentTypeLabel: contentTypeToLabel(contentType),
    };
  }

  private async updateReactivationEmailTracking(campaign: EmailCampaignDocument): Promise<void> {
    const sentRecipients = campaign.recipients.filter((recipient) => recipient.status === 'sent');
    await Promise.all(
      sentRecipients.map((recipient) =>
        this.userLoginActivityService.updateReactivationEmailSent(
          recipient.userId.toString(),
          campaign.communityId.toString(),
        ),
      ),
    );
  }

  private getDaysThreshold(period: InactivityPeriod): number {
    switch (period) {
      case InactivityPeriod.LAST_7_DAYS:
        return 7;
      case InactivityPeriod.LAST_15_DAYS:
        return 15;
      case InactivityPeriod.LAST_30_DAYS:
        return 30;
      case InactivityPeriod.LAST_60_DAYS:
        return 60;
      case InactivityPeriod.MORE_THAN_60_DAYS:
        return 61;
      default:
        return 7;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < array.length; index += size) {
      chunks.push(array.slice(index, index + size));
    }
    return chunks;
  }
}

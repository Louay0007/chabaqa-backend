import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Challenge, ChallengeDocument } from '../schema/challenge.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import {
  JoinChallengeDto,
  LeaveChallengeDto,
  UpdateProgressDto,
  CreateChallengePostDto,
  CreateChallengeCommentDto,
} from '../dto-challenge/join-challenge.dto';
import { CreateChallengeDto } from '../dto-challenge/create-challenge.dto';
import { UpdateChallengeDto } from '../dto-challenge/update-challenge.dto';
import { UpdateChallengeTasksDto } from '../dto-challenge/update-challenge-tasks.dto';
import { ChallengeSubmission, ChallengeSubmissionDocument } from '../schema/challenge-submission.schema';
import { CreateSubmissionDto, ReviewSubmissionDto } from '../dto-challenge/challenge-submission.dto';
import {
  ChallengeResponseDto,
  ChallengeListResponseDto,
} from '../dto-challenge/challenge-response.dto';
import {
  CreateChallengePricingDto,
  UpdateChallengePricingDto,
  CalculateChallengePriceDto,
  ChallengePriceCalculationResponseDto,
  CheckChallengeAccessDto,
  ChallengeAccessResponseDto,
} from '../dto-challenge/challenge-pricing.dto';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { FeeService } from '../common/services/fee.service';
import { PolicyService } from '../common/services/policy.service';
import { UploadService } from '../upload/upload.service';
import { TrackableContentType, TrackingActionType } from '../schema/content-tracking.schema';
import { AnalyticsDaily, AnalyticsDailyDocument } from '../schema/analytics-daily.schema';
import { Ga4Service } from '../ga4/ga4.service';
import { CacheService } from '../common/services/cache.service';

@Injectable()
export class ChallengeService {
  constructor(
    @InjectModel(Challenge.name)
    private challengeModel: Model<ChallengeDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ChallengeSubmission.name) private submissionModel: Model<ChallengeSubmissionDocument>,
    @InjectModel(AnalyticsDaily.name) private analyticsDailyModel: Model<AnalyticsDailyDocument>,
    private readonly trackingService: ContentTrackingService,
    private readonly feeService: FeeService,
    private readonly policyService: PolicyService,
    private readonly uploadService: UploadService,
    private readonly ga4Service: Ga4Service,
    private readonly cacheService: CacheService,
  ) { }

  private async invalidateChallengeCaches(creatorId?: string): Promise<void> {
    const patterns = ['http:/api/challenges*', 'http:/api/communities*'];
    if (creatorId) {
      patterns.push(`creator-analytics:${creatorId}:*`);
    }

    await Promise.allSettled(
      patterns.map((pattern) => this.cacheService.deletePattern(pattern)),
    );
  }

  private isPaidOrderRequired(): boolean {
    return String(process.env.PAYMENTS_REQUIRE_PAID_ORDER || '').toLowerCase() === 'true';
  }

  private buildPaymentRequiredException(params: {
    contentId: string;
    amount: number;
    message: string;
    initEndpoint: string;
    currency?: string;
  }): HttpException {
    return new HttpException(
      {
        code: 'PAYMENT_REQUIRED',
        contentType: TrackableContentType.CHALLENGE,
        contentId: params.contentId,
        amount: params.amount,
        currency: params.currency || 'TND',
        initEndpoint: params.initEndpoint,
        message: params.message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private buildCommunityLookupConditions(communityIds: string[]): any[] {
    return communityIds
      .flatMap((communityId) => [
        { _id: Types.ObjectId.isValid(communityId) ? new Types.ObjectId(communityId) : null },
        { id: communityId },
        { slug: communityId },
      ])
      .filter((condition) => Object.values(condition)[0] !== null);
  }

  private async resolveCommunitiesByKeys(
    communityIds: string[],
  ): Promise<Map<string, CommunityDocument | null>> {
    const keys = [...new Set((communityIds || []).map((value) => String(value || '')).filter(Boolean))];
    const map = new Map<string, CommunityDocument | null>();
    if (keys.length === 0) return map;

    const communities = await this.communityModel.find({
      $or: this.buildCommunityLookupConditions(keys),
    });

    for (const key of keys) {
      const match = communities.find((community: any) =>
        community?._id?.toString() === key ||
        String((community as any)?.id || '') === key ||
        String(community?.slug || '') === key,
      );
      map.set(key, match || null);
    }

    return map;
  }

  /**
   * Helper method to find a challenge by ID (supports both MongoDB _id and custom id field)
   */
  private async findChallengeById(id: string): Promise<ChallengeDocument | null> {
    let challenge: ChallengeDocument | null = null;

    // Try to find by MongoDB _id first
    if (Types.ObjectId.isValid(id)) {
      challenge = await this.challengeModel.findById(id);
    }

    // If not found, try by custom id field
    if (!challenge) {
      challenge = await this.challengeModel.findOne({ id });
    }

    if (challenge) {
      await this.ensureTaskAndResourceIds(challenge);
    }

    return challenge;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private sanitizeChallengeResources(resources: any[] = []): any[] {
    const allowedTypes = new Set(['video', 'article', 'code', 'tool', 'pdf', 'link']);
    return resources
      .filter((resource) =>
        this.isNonEmptyString(resource?.title) &&
        this.isNonEmptyString(resource?.url) &&
        this.isNonEmptyString(resource?.type) &&
        allowedTypes.has(resource.type.trim().toLowerCase()),
      )
      .map((resource) => ({
        ...resource,
        title: resource.title.trim(),
        url: this.uploadService.ensureAbsoluteUrl(resource.url.trim()),
        type: resource.type.trim().toLowerCase(),
        description: this.isNonEmptyString(resource?.description)
          ? resource.description.trim()
          : undefined,
      }));
  }

  private sanitizeTaskResources(resources: any[] = []): any[] {
    const allowedTypes = new Set(['video', 'article', 'code', 'tool']);
    return resources
      .filter((resource) =>
        this.isNonEmptyString(resource?.title) &&
        this.isNonEmptyString(resource?.url) &&
        this.isNonEmptyString(resource?.type) &&
        allowedTypes.has(resource.type.trim().toLowerCase()),
      )
      .map((resource) => ({
        ...resource,
        title: resource.title.trim(),
        url: this.uploadService.ensureAbsoluteUrl(resource.url.trim()),
        type: resource.type.trim().toLowerCase(),
        description: this.isNonEmptyString(resource?.description)
          ? resource.description.trim()
          : undefined,
      }));
  }

  private normalizeTaskInput(tasks: any[] = []): any[] {
    const normalizedTasks = (tasks || []).map((task) => ({
      ...task,
      id: this.isNonEmptyString(task?.id) ? task.id.trim() : new Types.ObjectId().toString(),
      day: Number(task?.day),
      title: this.isNonEmptyString(task?.title) ? task.title.trim() : task?.title,
      description: this.isNonEmptyString(task?.description) ? task.description.trim() : task?.description,
      deliverable: this.isNonEmptyString(task?.deliverable) ? task.deliverable.trim() : task?.deliverable,
      instructions: this.isNonEmptyString(task?.instructions) ? task.instructions.trim() : undefined,
      notes: this.isNonEmptyString(task?.notes) ? task.notes.trim() : undefined,
      points: Number(task?.points || 0),
      isActive: typeof task?.isActive === 'boolean' ? task.isActive : true,
      resources: this.sanitizeTaskResources(task?.resources || []).map((resource: any) => ({
        ...resource,
        id: this.isNonEmptyString(resource?.id)
          ? resource.id.trim()
          : new Types.ObjectId().toString(),
      })),
    }));

    const invalidDay = normalizedTasks.find((task) => !Number.isInteger(task.day) || task.day < 1);
    if (invalidDay) {
      throw new BadRequestException('Chaque tâche doit avoir un numéro de jour valide (>= 1)');
    }

    const uniqueDays = new Set(normalizedTasks.map((task) => task.day));
    if (uniqueDays.size !== normalizedTasks.length) {
      throw new BadRequestException('Chaque tâche doit avoir un numéro de jour unique');
    }

    normalizedTasks.sort((a, b) => a.day - b.day);
    return normalizedTasks;
  }

  private async ensureTaskAndResourceIds(challenge: ChallengeDocument): Promise<void> {
    if (!challenge?.tasks) return;

    let hasChanges = false;
    for (const task of challenge.tasks) {
      if (!this.isNonEmptyString(task.id)) {
        task.id = new Types.ObjectId().toString();
        hasChanges = true;
      }

      task.resources = (task.resources || []).map((resource: any) => {
        if (this.isNonEmptyString(resource?.id)) return resource;
        hasChanges = true;
        return { ...resource, id: new Types.ObjectId().toString() };
      });
    }

    if (hasChanges) {
      await challenge.save();
    }
  }

  private isAdminUser(user: any): boolean {
    const role = String(user?.role || user?.userRole || '').toLowerCase();
    return role === 'admin' || role === 'super_admin' || user?.isAdmin === true;
  }

  private assertCreatorOrAdmin(challenge: ChallengeDocument, userId: string, user?: any): void {
    if (challenge.creatorId?.toString() === String(userId)) return;
    if (this.isAdminUser(user)) return;
    throw new ForbiddenException('Accès non autorisé');
  }

  private resolveChallengeTask(challenge: ChallengeDocument, taskId: string): any | null {
    if (!challenge?.tasks?.length) return null;
    const directTask = challenge.tasks.find((task: any) => String(task.id) === String(taskId));
    if (directTask) return directTask;

    const numericTaskId = Number(taskId);
    if (Number.isInteger(numericTaskId) && numericTaskId > 0) {
      return challenge.tasks.find((task: any) => Number(task.day) === numericTaskId) || null;
    }

    return null;
  }

  /**
   * Get challenges for a specific user (participated + created)
   */
  async getChallengesByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type: 'participated' | 'created' | 'all' = 'all',
    communityId?: string,
    visibilityScope: 'owner' | 'public' = 'owner',
  ) {
    console.log('🔧 DEBUG - getChallengesByUser');
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📄 Page: ${page}, Limit: ${limit}, Type: ${type}, Scope: ${visibilityScope}`);
    if (communityId) {
      console.log(`   🏢 Community filter: ${communityId}`);
    }

    const skip = (page - 1) * limit;
    let allChallenges: any[] = [];
    let totalCount = 0;
    const isOwnerView = visibilityScope === 'owner';
    const communityFilter: any = {};
    if (communityId) {
      // communityId is stored as string in schema, so keep it as string
      communityFilter.communityId = Types.ObjectId.isValid(communityId)
        ? new Types.ObjectId(communityId).toString()
        : communityId;
    }

    // Get participated challenges
    if (isOwnerView && (type === 'participated' || type === 'all')) {
      const participatedChallenges = await this.challengeModel
        .find({ 'participants.userId': new Types.ObjectId(userId), ...communityFilter })
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .exec();

      const transformedParticipated = participatedChallenges.map(challenge => {
        const participant = challenge.participants.find(p => p.userId.toString() === userId);
        const completedTasksCount = participant?.completedTasks?.length || 0;
        const progress = participant && challenge.tasks && challenge.tasks.length > 0 ?
          Math.round((completedTasksCount / challenge.tasks.length) * 100) : 0;

        return {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          thumbnail: challenge.thumbnail || 'https://placehold.co/400x300?text=Challenge',
          communityId: String(challenge.communityId || ''),
          progress,
          status: progress === 100 ? 'completed' : progress > 0 ? 'active' : 'not_started',
          type: 'participated',
          category: challenge.category,
          difficulty: challenge.difficulty,
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          joinedAt: participant?.joinedAt,
          creator: {
            name: (challenge.creatorId as any)?.name || 'Unknown',
            avatar: this.uploadService.ensureAbsoluteUrl((challenge.creatorId as any)?.profile_picture || (challenge.creatorId as any)?.photo_profil || '') || 'https://placehold.co/64x64?text=MM'
          }
        };
      });

      allChallenges = [...allChallenges, ...transformedParticipated];
    }

    // Get created challenges
    if (type === 'created' || type === 'all') {
      const createdChallengeQuery: any = { creatorId: new Types.ObjectId(userId), ...communityFilter };
      if (!isOwnerView) {
        createdChallengeQuery.isActive = true;
      }

      const createdChallenges = await this.challengeModel
        .find(createdChallengeQuery)
        .populate('creatorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .exec();

      const transformedCreated = createdChallenges.map(challenge => ({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        thumbnail: challenge.thumbnail || 'https://placehold.co/400x300?text=Challenge',
        communityId: String(challenge.communityId || ''),
        progress: 100, // Creator has full access
        status: challenge.isActive ? 'active' : 'inactive',
        type: 'created',
        category: challenge.category,
        difficulty: challenge.difficulty,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        createdAt: challenge.createdAt,
        participantsCount: challenge.participants?.length || 0,
        creator: {
          name: (challenge.creatorId as any)?.name || 'Unknown',
          avatar: this.uploadService.ensureAbsoluteUrl((challenge.creatorId as any)?.profile_picture || (challenge.creatorId as any)?.photo_profil || '') || 'https://placehold.co/64x64?text=MM'
        }
      }));

      allChallenges = [...allChallenges, ...transformedCreated];
    }

    const communityMap = await this.resolveCommunitiesByKeys(
      allChallenges.map((challenge) => String(challenge.communityId || '')).filter(Boolean),
    );
    allChallenges = allChallenges.map((challenge) => {
      const community = communityMap.get(String(challenge.communityId || '')) || null;
      const communitySlug = community?.slug || null;
      return {
        ...challenge,
        community: community
          ? {
              id: String((community as any).id || community._id?.toString() || ''),
              name: community.name,
              slug: community.slug,
            }
          : null,
        communityName: community?.name || null,
        communitySlug,
        slug: communitySlug,
      };
    });

    // Sort by most recent activity
    allChallenges.sort((a, b) => {
      const dateA = new Date(a.joinedAt || a.createdAt || 0);
      const dateB = new Date(b.joinedAt || b.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    totalCount = allChallenges.length;
    const paginatedChallenges = allChallenges.slice(skip, skip + limit);

    console.log(`   📊 Total challenges found: ${totalCount}`);
    console.log(`   📄 Returning: ${paginatedChallenges.length} challenges`);

    return {
      success: true,
      message: 'User challenges retrieved successfully',
      data: {
        challenges: paginatedChallenges,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    };
  }

  /**
   * Submit a project for a challenge task
   */
  async submitProject(dto: CreateSubmissionDto, userId: string): Promise<any> {
    const challenge = await this.findChallengeById(dto.challengeId);
    if (!challenge) throw new NotFoundException('Challenge not found');

    const task = challenge.tasks?.find((t) => t.id && String(t.id) === String(dto.taskId));

    // Log the challenge tasks to debug if not found
    if (!task) {
      console.log(`[CHALLENGE-SERVICE] Debug - Attempting to match taskId: "${dto.taskId}" (type: ${typeof dto.taskId})`);
      console.log(`[CHALLENGE-SERVICE] Debug - Challenge tasks for ${challenge.id}:`,
        challenge.tasks?.map(t => ({ id: t.id, day: t.day, _id: (t as any)._id }))
      );
    }

    // Temporary compatibility fallback: allow day-based taskId during migration window
    let finalTask = task;
    if (!finalTask) {
      if (/^\d+$/.test(String(dto.taskId))) {
        const dayNum = parseInt(String(dto.taskId), 10);
        finalTask = challenge.tasks?.find(t => t.day === dayNum);
      }
    }

    if (!finalTask) {
      console.error(`❌ [CHALLENGE-SERVICE] Task not found: ${dto.taskId} in challenge ${challenge.id}. Available IDs:`,
        challenge.tasks?.map(t => t.id || (t as any)._id?.toString())
      );
      throw new NotFoundException('Task not found');
    }

    const isParticipant = challenge.participants.some(p =>
      String(p.userId) === String(userId) ||
      (p.userId as any)._id?.toString() === String(userId)
    );
    if (!isParticipant) {
      console.log(`[CHALLENGE-SERVICE] Debug - Participant check failed for user ${userId}. Current participants:`,
        challenge.participants.map(p => String(p.userId))
      );

      // AUTO-HEAL: If the user is the creator of the challenge, ensure they are a participant
      const isCreator = String(challenge.creatorId) === String(userId);
      if (isCreator) {
        console.log(`[CHALLENGE-SERVICE] Auto-heal - User ${userId} is the creator, adding as participant.`);
        // Add creator as participant using the schema method
        (challenge as any).addParticipant(new Types.ObjectId(userId));
        await challenge.save();
      } else {
        throw new ForbiddenException('User is not a participant of this challenge');
      }
    }

    if (!finalTask.id) {
      throw new BadRequestException('Task has no canonical ID');
    }
    const canonicalTaskId = String(finalTask.id);

    // Check if submission already exists using the CANONICAL taskId
    const existingSubmission = await this.submissionModel.findOne({
      challengeId: challenge._id,
      taskId: canonicalTaskId,
      userId: new Types.ObjectId(userId)
    });

    if (existingSubmission) {
      throw new BadRequestException('Vous avez déjà soumis un projet pour cette tâche.');
    }

    const submission = new this.submissionModel({
      challengeId: challenge._id,
      taskId: canonicalTaskId,
      userId: new Types.ObjectId(userId),
      content: dto.content,
      links: dto.links || [],
      files: dto.files || [],
      status: 'pending'
    });

    await submission.save();

    // Unified Progression Tracking: Update the global content tracking system
    try {
      const totalTasks = challenge.tasks?.length || 1;
      const participant = challenge.participants.find(p => String(p.userId) === String(userId));
      const completedTasks = participant?.completedTasks?.length || 0;
      // Even if pending, submitting a task counts as progress activity
      const progressPercent = Math.round((completedTasks / totalTasks) * 100);

      await this.trackingService.updateProgress(
        userId,
        challenge._id.toString(),
        TrackableContentType.CHALLENGE,
        progressPercent,
        {
          completedTasks,
          totalTasks,
          lastTaskId: canonicalTaskId,
          submissionStatus: 'pending'
        }
      );
      console.log(`✅ [CHALLENGE-SERVICE] Synced progression for user ${userId} (Challenge: ${challenge._id})`);
    } catch (error) {
      console.error(`⚠️ [CHALLENGE-SERVICE] Failed to sync progression:`, error.message);
    }

    return submission;
  }

  /**
   * Get all submissions for a challenge (for the user)
   */
  async getSubmissions(challengeId: string, userId: string): Promise<any> {
    console.log(`🔍 [CHALLENGE-SERVICE] getSubmissions for challenge ${challengeId} user ${userId}`);

    // Resolve challenge first to ensure we have the correct _id (in case challengeId is a slug/custom ID)
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      console.warn(`⚠️ [CHALLENGE-SERVICE] Challenge not found for getSubmissions: ${challengeId}`);
      return [];
    }

    const query = {
      challengeId: challenge._id,
      userId: new Types.ObjectId(userId)
    };

    console.log(`🔍 [CHALLENGE-SERVICE] Querying submissions with:`, query);

    const submissions = await this.submissionModel.find(query).sort({ createdAt: -1 }).lean();
    console.log(`✅ [CHALLENGE-SERVICE] Found ${submissions.length} submissions`);

    const tasksById = new Map((challenge.tasks || []).map((task: any) => [String(task.id), task]));

    return submissions.map((submission: any) => {
      const task = tasksById.get(String(submission.taskId));
      return {
        ...submission,
        challengeId: challenge.id,
        taskId: String(submission.taskId),
        taskDay: task?.day ?? null,
        taskTitle: task?.title ?? null,
      };
    });
  }

  async getAllSubmissionsForCreator(challengeId: string, userId: string, user?: any): Promise<any> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }
    this.assertCreatorOrAdmin(challenge, userId, user);

    const submissions = await this.submissionModel
      .find({ challengeId: challenge._id })
      .sort({ createdAt: -1 })
      .lean();

    const userIds = [...new Set(submissions.map((s: any) => String(s.userId)))];
    const users = await this.userModel
      .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .select('name profile_picture photo_profil email')
      .lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    const enriched = submissions.map((submission: any) => {
      const submissionUser = userMap.get(String(submission.userId));
      const task = this.resolveChallengeTask(challenge as any, String(submission.taskId));
      const canonicalTaskId = task?.id ? String(task.id) : String(submission.taskId);
      return {
        ...submission,
        challengeId: challenge.id,
        taskId: canonicalTaskId,
        files: Array.isArray(submission.files)
          ? submission.files.map((file: string) => this.uploadService.ensureAbsoluteUrl(file)).filter(Boolean)
          : [],
        links: Array.isArray(submission.links)
          ? submission.links.filter((link: string) => typeof link === 'string' && link.trim().length > 0)
          : [],
        taskTitle: task?.title || null,
        taskDay: task?.day || null,
        taskPoints: Number(task?.points || 0),
        user: {
          id: String(submission.userId),
          name: submissionUser?.name || 'Unknown user',
          email: submissionUser?.email || '',
          avatar: this.uploadService.ensureAbsoluteUrl(submissionUser?.profile_picture || submissionUser?.photo_profil),
        },
      };
    });

    const byParticipantMap = new Map<string, any>();
    const byTaskMap = new Map<string, any>();
    for (const item of enriched) {
      const u = item.user.id;
      const t = String(item.taskId);
      if (!byParticipantMap.has(u)) {
        byParticipantMap.set(u, {
          user: item.user,
          totalSubmissions: 0,
          pendingCount: 0,
          reviewedCount: 0,
          submissions: [],
        });
      }
      const participantGroup = byParticipantMap.get(u);
      participantGroup.totalSubmissions += 1;
      if (item.status === 'pending') participantGroup.pendingCount += 1;
      if (item.status !== 'pending') participantGroup.reviewedCount += 1;
      participantGroup.submissions.push(item);

      if (!byTaskMap.has(t)) {
        byTaskMap.set(t, {
          taskId: item.taskId,
          taskTitle: item.taskTitle,
          taskDay: item.taskDay,
          totalSubmissions: 0,
          pendingCount: 0,
          reviewedCount: 0,
          submissions: [],
        });
      }
      const taskGroup = byTaskMap.get(t);
      taskGroup.totalSubmissions += 1;
      if (item.status === 'pending') taskGroup.pendingCount += 1;
      if (item.status !== 'pending') taskGroup.reviewedCount += 1;
      taskGroup.submissions.push(item);
    }

    return {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      totalSubmissions: enriched.length,
      byParticipant: Array.from(byParticipantMap.values()),
      byTask: Array.from(byTaskMap.values()),
      submissions: enriched,
    };
  }

  /**
   * Get submission for a specific task
   */
  async getTaskSubmission(challengeId: string, taskId: string, userId: string): Promise<any> {
    const submission = await this.submissionModel.findOne({
      challengeId: new Types.ObjectId(challengeId),
      taskId,
      userId: new Types.ObjectId(userId)
    });

    if (!submission) return null;
    return submission;
  }

  /**
   * Review a project submission
   */
  async reviewSubmission(submissionId: string, dto: ReviewSubmissionDto, reviewerId: string, reviewerUser?: any): Promise<any> {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const challenge = await this.findChallengeById(submission.challengeId.toString());
    if (!challenge) throw new NotFoundException('Challenge not found');
    this.assertCreatorOrAdmin(challenge, reviewerId, reviewerUser);

    const previousStatus = submission.status;
    const resolvedTask = this.resolveChallengeTask(challenge as any, String(submission.taskId));
    const canonicalTaskId = resolvedTask?.id ? String(resolvedTask.id) : String(submission.taskId);

    if (previousStatus === 'approved') {
      throw new BadRequestException('Approved submissions are locked and cannot be reviewed again.');
    }

    // Auto-heal legacy day-based task IDs so review/progress points are always tied to canonical task IDs.
    if (canonicalTaskId !== String(submission.taskId)) {
      submission.taskId = canonicalTaskId;
    }

    submission.status = dto.status;
    submission.feedback = dto.feedback;
    submission.reviewedBy = new Types.ObjectId(reviewerId);
    submission.reviewedAt = new Date();

    if (dto.status === 'approved') {
      const autoPoints = Number(resolvedTask?.points || 0);
      const requestedPoints = Number(dto.pointsAwarded);
      submission.pointsAwarded =
        Number.isFinite(requestedPoints) && requestedPoints >= 0
          ? requestedPoints
          : autoPoints;
    } else {
      submission.pointsAwarded = 0;
    }

    await submission.save();

    // If approved, ensure progress is marked as completed (only on first approval transition).
    if (dto.status === 'approved') {
      await this.updateProgress({
        challengeId: submission.challengeId.toString(),
        taskId: canonicalTaskId,
        status: 'completed'
      }, submission.userId.toString());
    }

    return submission;
  }

  async publishChallenge(challengeId: string, userId: string): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) throw new NotFoundException('Challenge not found');

    if (challenge.creatorId.toString() !== String(userId)) {
      throw new ForbiddenException('Seul le créateur du défi peut publier ce défi');
    }

    const hasSub = await this.policyService.hasActiveSubscription(userId);
    if (!hasSub) {
      throw new ForbiddenException('Un abonnement actif est requis pour publier ce défi');
    }

    if (!this.isNonEmptyString(challenge.title) || !this.isNonEmptyString(challenge.description)) {
      throw new BadRequestException('Le titre et la description sont requis avant publication');
    }
    if (!challenge.tasks || challenge.tasks.length === 0) {
      throw new BadRequestException('Au moins une tâche est requise avant publication');
    }
    if (!challenge.startDate || !challenge.endDate || challenge.startDate >= challenge.endDate) {
      throw new BadRequestException('Les dates de début et fin sont invalides');
    }

    challenge.isActive = true;
    await challenge.save();
    await this.invalidateChallengeCaches(challenge.creatorId.toString());

    const community = await this.communityModel.findOne({ id: challenge.communityId });
    return this.transformToResponseDto(challenge, community || undefined);
  }

  async getRewardEligibility(challengeId: string, userId: string, user?: any): Promise<any> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) throw new NotFoundException('Challenge not found');
    this.assertCreatorOrAdmin(challenge, userId, user);

    const participants = [...(challenge.participants || [])].filter((p: any) => p.isActive !== false);
    const totalTasks = challenge.tasks?.length || 0;
    const withMetrics = participants.map((participant: any) => ({
      userId: String(participant.userId),
      totalPoints: Number(participant.totalPoints || 0),
      progress: Number(participant.progress || 0),
      joinedAt: participant.joinedAt,
      completedTasks: participant.completedTasks || [],
      isCompleter: totalTasks > 0 && (participant.completedTasks || []).length >= totalTasks,
    }));

    const completionRecipients = withMetrics
      .filter((p) => p.isCompleter)
      .map((p) => ({ userId: p.userId, amount: Number(challenge.completionReward || 0), reason: 'completed_all_tasks' }));

    const topPerformerSorted = [...withMetrics].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
    const topPerformerWinner = topPerformerSorted[0]
      ? [{ userId: topPerformerSorted[0].userId, amount: Number(challenge.topPerformerBonus || 0), reason: 'highest_points_tiebreak_progress_joinedAt' }]
      : [];

    const streakRecipients = withMetrics
      .filter((p) => p.progress >= 100)
      .map((p) => ({ userId: p.userId, amount: Number(challenge.streakBonus || 0), reason: 'fallback_full_progress' }));

    return {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      completionReward: Number(challenge.completionReward || 0),
      topPerformerBonus: Number(challenge.topPerformerBonus || 0),
      streakBonus: Number(challenge.streakBonus || 0),
      totalParticipants: participants.length,
      completionRecipients,
      topPerformerWinner,
      streakRecipients,
      latestDistribution: challenge.rewardDistributions?.[challenge.rewardDistributions.length - 1] || null,
    };
  }

  async distributeRewards(
    challengeId: string,
    userId: string,
    user: any,
    payload: {
      idempotencyKey: string;
      payouts?: Array<{ userId: string; rewardType: 'completion' | 'top_performer' | 'streak'; amount: number }>;
    },
  ): Promise<any> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) throw new NotFoundException('Challenge not found');
    this.assertCreatorOrAdmin(challenge, userId, user);

    if (!this.isNonEmptyString(payload?.idempotencyKey)) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const existing = (challenge.rewardDistributions || []).find(
      (distribution: any) => distribution.idempotencyKey === payload.idempotencyKey,
    );
    if (existing) {
      return {
        success: true,
        idempotent: true,
        message: 'Reward distribution already processed for this idempotency key',
        data: existing,
      };
    }

    let payouts = payload.payouts || [];
    if (payouts.length === 0) {
      const eligibility = await this.getRewardEligibility(challengeId, userId, user);
      payouts = [
        ...eligibility.completionRecipients.map((item: any) => ({ userId: item.userId, rewardType: 'completion', amount: item.amount })),
        ...eligibility.topPerformerWinner.map((item: any) => ({ userId: item.userId, rewardType: 'top_performer', amount: item.amount })),
        ...eligibility.streakRecipients.map((item: any) => ({ userId: item.userId, rewardType: 'streak', amount: item.amount })),
      ];
    }

    const normalizedPayouts = payouts
      .filter((payout) => this.isNonEmptyString(payout.userId) && Number(payout.amount) > 0)
      .map((payout) => ({
        userId: new Types.ObjectId(payout.userId),
        rewardType: payout.rewardType,
        amount: Number(payout.amount),
        status: 'processed' as const,
      }));

    const summary = {
      completionCount: normalizedPayouts.filter((payout) => payout.rewardType === 'completion').length,
      topPerformerCount: normalizedPayouts.filter((payout) => payout.rewardType === 'top_performer').length,
      streakCount: normalizedPayouts.filter((payout) => payout.rewardType === 'streak').length,
      totalAmount: normalizedPayouts.reduce((total, payout) => total + Number(payout.amount || 0), 0),
    };

    const distribution = {
      idempotencyKey: payload.idempotencyKey,
      status: 'processed' as const,
      distributedAt: new Date(),
      distributedBy: new Types.ObjectId(userId),
      summary,
      payouts: normalizedPayouts,
    };

    challenge.rewardDistributions = [...(challenge.rewardDistributions || []), distribution];
    await challenge.save();

    return {
      success: true,
      message: 'Rewards distributed successfully',
      data: distribution,
    };
  }

  /**
   * Récupérer les participations de l'utilisateur aux défis
   */
  async getUserParticipations(
    userId: string,
    communitySlug?: string,
    status: string = 'all',
  ): Promise<any> {
    try {
      // Build query to find challenges where user is a participant
      const query: any = {
        'participants.userId': new Types.ObjectId(userId),
      };

      // Filter by community if provided
      if (communitySlug) {
        const community = await this.communityModel.findOne({
          slug: communitySlug,
        });
        if (community) {
          query.communityId = community.id;
        }
      }

      // Filter by status
      const now = new Date();
      if (status === 'active') {
        query.endDate = { $gte: now };
        query.isActive = true;
      } else if (status === 'completed') {
        query.endDate = { $lt: now };
      }

      const challenges = await this.challengeModel
        .find(query)
        .populate('creatorId', 'name email photo_profil profile_picture avatar')
        .populate('communityId', 'name slug logo')
        .sort({ 'participants.joinedAt': -1 })
        .lean();

      // Transform data to include user-specific participation info
      const participations = challenges.map((challenge) => {
        const participant = challenge.participants?.find(
          (p) => p.userId?.toString() === userId,
        );

        // Calculate completed tasks
        const completedTasks = participant?.completedTasks?.length || 0;
        const totalTasks = challenge.tasks?.length || 0;
        const progress =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const challengeId = challenge.id || challenge._id?.toString?.() || challenge._id;
        return {
          challengeId,
          challenge: {
            id: challengeId,
            title: challenge.title,
            description: challenge.description,
            thumbnail: challenge.thumbnail || '/placeholder.svg',
            category: challenge.category || 'General',
            difficulty: challenge.difficulty || 'Intermediate',
            startDate: challenge.startDate,
            endDate: challenge.endDate,
            communityId: challenge.communityId,
            depositAmount: challenge.depositAmount || 0,
            completionReward: challenge.completionReward || 0,
            creator: challenge.creatorId,
          },
          joinedAt: participant?.joinedAt || new Date(),
          progress,
          completedTasks,
          totalTasks,
          isActive:
            participant?.isActive !== false &&
            new Date(challenge.endDate) >= now,
          lastActivityAt:
            participant?.lastActivityAt || participant?.joinedAt || new Date(),
        };
      });

      return {
        success: true,
        data: {
          participations,
          total: participations.length,
        },
      };
    } catch (error) {
      console.error('Error getting user participations:', error);
      throw new BadRequestException(
        'Erreur lors de la récupération des participations',
      );
    }
  }

  /**
   * Créer un nouveau défi
   */
  async create(
    createChallengeDto: CreateChallengeDto,
    creatorId: string | any,
  ): Promise<ChallengeResponseDto> {
    // Vérifier que la communauté existe
    const community = await this.communityModel.findOne({
      slug: createChallengeDto.communitySlug,
    });
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    // Normalize creatorId to string for comparison
    const normalizedCreatorId = typeof creatorId === 'object'
      ? creatorId.toString()
      : String(creatorId);
    const communityCreatorId = community.createur?.toString();

    // Vérifier que l'utilisateur est le créateur de la communauté
    if (communityCreatorId !== normalizedCreatorId) {
      console.error(
        `❌ Permission denied: Community creator (${communityCreatorId}) does not match user (${normalizedCreatorId})`
      );
      throw new ForbiddenException(
        'Seul le créateur de la communauté peut créer des défis',
      );
    }

    // Vérifier les dates
    const startDate = new Date(createChallengeDto.startDate);
    const endDate = new Date(createChallengeDto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException(
        'La date de début doit être antérieure à la date de fin',
      );
    }

    // Générer un ID unique pour le défi
    const challengeId = new Types.ObjectId().toString();

    // Gating: require active subscription to activate premium or active challenges
    const hasSub = await this.policyService.hasActiveSubscription(creatorId);
    if (
      !hasSub &&
      (createChallengeDto.isActive || createChallengeDto.isPremium)
    ) {
      throw new ForbiddenException(
        'Un abonnement actif est requis pour activer ou lancer un défi',
      );
    }

    // Ensure all tasks have IDs and their resources have IDs
    const incomingTasks =
      (createChallengeDto.tasks && createChallengeDto.tasks.length > 0)
        ? createChallengeDto.tasks
        : (createChallengeDto.steps || []);
    const tasksWithIds = this.normalizeTaskInput(incomingTasks);

    // Ensure all challenge resources have IDs
    const resourcesWithIds = this.sanitizeChallengeResources(createChallengeDto.resources || []).map((res, index) => ({
      ...res,
      id: res.id || new Types.ObjectId().toString(),
      order: res.order ?? index + 1,
    }));

    // Créer le défi
    const challenge = new this.challengeModel({
      id: challengeId,
      title: createChallengeDto.title,
      description: createChallengeDto.description,
      communityId: community.id,
      creatorId: new Types.ObjectId(creatorId),
      startDate: startDate,
      endDate: endDate,
      isActive: createChallengeDto.isActive ?? true,
      depositAmount: createChallengeDto.depositAmount,
      maxParticipants: createChallengeDto.maxParticipants,
      completionReward: createChallengeDto.completionReward,
      topPerformerBonus: createChallengeDto.topPerformerBonus,
      streakBonus: createChallengeDto.streakBonus,
      category: createChallengeDto.category,
      difficulty: createChallengeDto.difficulty,
      duration: createChallengeDto.duration,
      thumbnail: createChallengeDto.thumbnail,
      notes: createChallengeDto.notes,
      resources: resourcesWithIds,
      tasks: tasksWithIds,
      sequentialProgression: createChallengeDto.sequentialProgression ?? false,
      unlockMessage: createChallengeDto.unlockMessage,
      // Configuration de prix
      pricing: {
        participationFee: createChallengeDto.participationFee || 0,
        currency: createChallengeDto.currency || 'USD',
        depositAmount: createChallengeDto.depositAmount,
        depositRequired: createChallengeDto.depositRequired || false,
        completionReward: createChallengeDto.completionReward,
        topPerformerBonus: createChallengeDto.topPerformerBonus,
        streakBonus: createChallengeDto.streakBonus,
        isPremium: createChallengeDto.isPremium || false,
        premiumFeatures: {
          personalMentoring:
            createChallengeDto.premiumFeatures?.personalMentoring || false,
          exclusiveResources:
            createChallengeDto.premiumFeatures?.exclusiveResources || false,
          priorityFeedback:
            createChallengeDto.premiumFeatures?.priorityFeedback || false,
          certificate: createChallengeDto.premiumFeatures?.certificate || false,
          liveSessions:
            createChallengeDto.premiumFeatures?.liveSessions || false,
          communityAccess:
            createChallengeDto.premiumFeatures?.communityAccess || false,
        },
        paymentOptions: {
          allowInstallments:
            createChallengeDto.paymentOptions?.allowInstallments || false,
          installmentCount: createChallengeDto.paymentOptions?.installmentCount,
          earlyBirdDiscount:
            createChallengeDto.paymentOptions?.earlyBirdDiscount,
          groupDiscount: createChallengeDto.paymentOptions?.groupDiscount,
          memberDiscount: createChallengeDto.paymentOptions?.memberDiscount,
        },
        freeTrialDays: createChallengeDto.freeTrialDays,
        trialFeatures: createChallengeDto.trialFeatures || [],
      },
    });

    const savedChallenge = await challenge.save();
    await this.invalidateChallengeCaches(normalizedCreatorId);
    return this.transformToResponseDto(savedChallenge, community);
  }

  /**
   * Récupérer tous les défis avec pagination et filtres
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    communitySlug?: string,
    category?: string,
    difficulty?: string,
    isActive?: boolean,
  ): Promise<ChallengeListResponseDto> {
    const query: any = {};

    // Filtres
    if (communitySlug) {
      const community = await this.communityModel.findOne({
        slug: communitySlug,
      });
      if (community) {
        query.communityId = community.id;
      }
    }

    if (category) {
      query.category = category;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const [challenges, total] = await Promise.all([
      this.challengeModel
        .find(query)
        .populate('creatorId', 'name email avatar profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.challengeModel.countDocuments(query),
    ]);

    // Récupérer les communautés pour chaque défi
    const communityIds = [...new Set(challenges.map((c) => c.communityId))];
    const communities = await this.communityModel.find({
      _id: { $in: communityIds.map(id => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id) },
    });

    const challengeResponses = await Promise.all(
      challenges.map((challenge) => {
        const community = communities.find(
          (c) => c._id.toString() === challenge.communityId.toString(),
        );
        return this.transformToResponseDto(challenge, community || undefined);
      }),
    );

    return {
      challenges: challengeResponses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Récupérer un défi par son ID
   */
  async findOne(id: string): Promise<ChallengeResponseDto> {
    // Try to find by MongoDB _id first, then by custom id field
    let challenge: ChallengeDocument | null = null;

    if (Types.ObjectId.isValid(id)) {
      challenge = await this.challengeModel
        .findById(id)
        .populate('creatorId', 'name email avatar profile_picture photo_profil')
        .exec();
    }

    if (!challenge) {
      challenge = await this.challengeModel
        .findOne({ id })
        .populate('creatorId', 'name email avatar profile_picture photo_profil')
        .exec();
    }

    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    await this.ensureTaskAndResourceIds(challenge);

    // Look up community by _id (convert string to ObjectId if needed)
    let community;
    try {
      community = await this.communityModel.findOne({
        _id: new Types.ObjectId(challenge.communityId),
      });
    } catch (e) {
      // If conversion fails, try looking up by id field as fallback
      community = await this.communityModel.findOne({
        id: challenge.communityId,
      });
    }

    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    return this.transformToResponseDto(challenge, community || undefined);
  }

  /**
   * Récupérer les défis d'une communauté
   */
  async findByCommunity(
    communitySlug: string,
  ): Promise<ChallengeResponseDto[]> {
    const community = await this.communityModel.findOne({
      slug: communitySlug,
    });
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    const challenges = await this.challengeModel
      .find({ communityId: community.id })
      .populate('creatorId', 'name email avatar profile_picture photo_profil')
      .sort({ createdAt: -1 })
      .exec();

    return Promise.all(
      challenges.map((challenge) =>
        this.transformToResponseDto(challenge, community),
      ),
    );
  }

  /**
   * Mettre à jour un défi
   */
  async update(
    id: string,
    updateChallengeDto: UpdateChallengeDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    // Try to find by MongoDB _id first, then by custom id field
    let challenge: ChallengeDocument | null = null;

    if (Types.ObjectId.isValid(id)) {
      challenge = await this.challengeModel.findById(id);
    }

    if (!challenge) {
      challenge = await this.challengeModel.findOne({ id });
    }

    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du défi
    // Handle both ObjectId and string comparison
    const creatorIdStr = challenge.creatorId?.toString() || '';
    const userIdStr = userId?.toString() || '';

    console.log('🔧 DEBUG - Challenge Update Authorization');
    console.log(`   Challenge ID: ${id}`);
    console.log(`   Creator ID (from challenge): ${creatorIdStr}`);
    console.log(`   User ID (from request): ${userIdStr}`);
    console.log(`   Match: ${creatorIdStr === userIdStr}`);

    if (creatorIdStr !== userIdStr) {
      // Also try comparing with _id in case userId is the MongoDB _id
      const challengeMongoId = challenge._id?.toString() || '';
      console.log(`   Challenge MongoDB _id: ${challengeMongoId}`);

      throw new ForbiddenException('Seul le créateur du défi peut le modifier');
    }

    // Vérifier les dates si elles sont fournies
    if (updateChallengeDto.startDate && updateChallengeDto.endDate) {
      const startDate = new Date(updateChallengeDto.startDate);
      const endDate = new Date(updateChallengeDto.endDate);

      if (startDate >= endDate) {
        throw new BadRequestException(
          'La date de début doit être antérieure à la date de fin',
        );
      }
    }

    // Ensure all tasks have IDs and their resources have IDs
    if ((!updateChallengeDto.tasks || updateChallengeDto.tasks.length === 0) && (updateChallengeDto as any).steps?.length) {
      updateChallengeDto.tasks = (updateChallengeDto as any).steps;
    }

    if (updateChallengeDto.tasks) {
      updateChallengeDto.tasks = this.normalizeTaskInput(updateChallengeDto.tasks);
    }

    // Ensure all challenge resources have IDs
    if (updateChallengeDto.resources) {
      updateChallengeDto.resources = this.sanitizeChallengeResources(updateChallengeDto.resources).map((res, index) => ({
        ...res,
        id: res.id || new Types.ObjectId().toString(),
        order: res.order ?? index + 1,
      }));
    }

    // Handle Pricing fields update
    if (
      updateChallengeDto.participationFee !== undefined ||
      updateChallengeDto.currency !== undefined ||
      updateChallengeDto.depositAmount !== undefined ||
      updateChallengeDto.depositRequired !== undefined ||
      updateChallengeDto.completionReward !== undefined ||
      updateChallengeDto.topPerformerBonus !== undefined ||
      updateChallengeDto.streakBonus !== undefined ||
      updateChallengeDto.isPremium !== undefined ||
      updateChallengeDto.premiumFeatures !== undefined ||
      updateChallengeDto.paymentOptions !== undefined ||
      updateChallengeDto.freeTrialDays !== undefined ||
      updateChallengeDto.trialFeatures !== undefined
    ) {
      if (!challenge.pricing) {
        challenge.pricing = {
          price: 0,
          priceType: 'free',
          isRecurring: false,
          participationFee: 0,
          currency: 'USD',
          depositRequired: false,
          isPremium: false,
          premiumFeatures: {
            personalMentoring: false,
            exclusiveResources: false,
            priorityFeedback: false,
            certificate: false,
            liveSessions: false,
            communityAccess: false,
          },
          features: [],
          paymentOptions: {
            allowInstallments: false,
          },
        };
      }

      if (updateChallengeDto.participationFee !== undefined) challenge.pricing.participationFee = updateChallengeDto.participationFee;
      if (updateChallengeDto.currency !== undefined) challenge.pricing.currency = updateChallengeDto.currency;
      if (updateChallengeDto.depositAmount !== undefined) challenge.pricing.depositAmount = updateChallengeDto.depositAmount;
      if (updateChallengeDto.depositRequired !== undefined) challenge.pricing.depositRequired = updateChallengeDto.depositRequired;
      if (updateChallengeDto.completionReward !== undefined) challenge.pricing.completionReward = updateChallengeDto.completionReward;
      if (updateChallengeDto.topPerformerBonus !== undefined) challenge.pricing.topPerformerBonus = updateChallengeDto.topPerformerBonus;
      if (updateChallengeDto.streakBonus !== undefined) challenge.pricing.streakBonus = updateChallengeDto.streakBonus;
      if (updateChallengeDto.isPremium !== undefined) challenge.pricing.isPremium = updateChallengeDto.isPremium;
      if (updateChallengeDto.premiumFeatures !== undefined) {
        challenge.pricing.premiumFeatures = {
          ...challenge.pricing.premiumFeatures,
          ...(updateChallengeDto.premiumFeatures as any)
        };
      }
      if (updateChallengeDto.paymentOptions !== undefined) {
        challenge.pricing.paymentOptions = {
          ...challenge.pricing.paymentOptions,
          ...(updateChallengeDto.paymentOptions as any)
        };
      }
      if (updateChallengeDto.freeTrialDays !== undefined) challenge.pricing.freeTrialDays = updateChallengeDto.freeTrialDays;
      if (updateChallengeDto.trialFeatures !== undefined) challenge.pricing.trialFeatures = updateChallengeDto.trialFeatures;
    }

    // Mettre à jour le défi en évitant d'écraser les champs existants avec undefined
    const safeUpdatePayload = Object.fromEntries(
      Object.entries(updateChallengeDto as Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Record<string, unknown>;

    // steps est un alias legacy et ne doit jamais être persisté sur le document
    delete (safeUpdatePayload as any).steps;

    Object.assign(challenge, safeUpdatePayload);

    if (updateChallengeDto.startDate) {
      challenge.startDate = new Date(updateChallengeDto.startDate);
    }
    if (updateChallengeDto.endDate) {
      challenge.endDate = new Date(updateChallengeDto.endDate);
    }

    const updatedChallenge = await challenge.save();
    await this.invalidateChallengeCaches(challenge.creatorId.toString());

    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    });
    return this.transformToResponseDto(updatedChallenge, community);
  }

  async updateTasks(
    id: string,
    updateTasksDto: UpdateChallengeTasksDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(id);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    if (challenge.creatorId.toString() !== String(userId)) {
      throw new ForbiddenException('Seul le créateur du défi peut modifier ses tâches');
    }

    challenge.tasks = this.normalizeTaskInput(updateTasksDto.tasks || []);
    const updatedChallenge = await challenge.save();
    await this.invalidateChallengeCaches(challenge.creatorId.toString());
    const community = await this.communityModel.findOne({ id: challenge.communityId });
    return this.transformToResponseDto(updatedChallenge, community || undefined);
  }

  /**
   * Supprimer un défi
   */
  async remove(id: string, userId: string): Promise<void> {
    // Try to find by MongoDB _id first, then by custom id field
    let challenge: ChallengeDocument | null = null;

    if (Types.ObjectId.isValid(id)) {
      challenge = await this.challengeModel.findById(id);
    }

    if (!challenge) {
      challenge = await this.challengeModel.findOne({ id });
    }

    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du défi
    const creatorIdStr = challenge.creatorId?.toString() || '';
    const userIdStr = userId?.toString() || '';

    if (creatorIdStr !== userIdStr) {
      throw new ForbiddenException(
        'Seul le créateur du défi peut le supprimer',
      );
    }

    await this.challengeModel.deleteOne({ _id: challenge._id });
    await this.invalidateChallengeCaches(challenge.creatorId.toString());
  }

  /**
   * Rejoindre un défi
   */
  async joinChallenge(
    joinChallengeDto: JoinChallengeDto,
    userId: string,
    session: any = null,
  ): Promise<ChallengeResponseDto> {
    // Try to find by MongoDB _id first, then by custom id field
    let challenge: ChallengeDocument | null = null;
    const challengeId = joinChallengeDto.challengeId;

    if (Types.ObjectId.isValid(challengeId)) {
      challenge = await this.challengeModel.findById(challengeId).session(session);
    }

    if (!challenge) {
      challenge = await this.challengeModel.findOne({ id: challengeId }).session(session);
    }

    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que le défi est actif
    if (!challenge.isActive) {
      throw new BadRequestException("Ce défi n'est plus actif");
    }

    // Vérifier que le défi n'a pas encore commencé ou est en cours
    const now = new Date();
    if (now > challenge.endDate) {
      throw new BadRequestException('Ce défi est terminé');
    }

    // Vérifier le nombre maximum de participants
    if (
      challenge.maxParticipants &&
      challenge.participants.length >= challenge.maxParticipants
    ) {
      throw new BadRequestException(
        'Le nombre maximum de participants est atteint',
      );
    }

    // Vérifier que l'utilisateur n'est pas déjà participant
    if (challenge.isParticipant(new Types.ObjectId(userId))) {
      throw new BadRequestException('Vous êtes déjà participant à ce défi');
    }

    // Si participation payante, créer un order avec fees s'il n'existe pas déjà
    const price = challenge.pricing?.participationFee || 0;
    const FREE_MODE = process.env.FREE_MODE === 'true';
    if (price > 0 && !FREE_MODE) {
      const existingOrder = await (this.challengeModel as any).db.model('Order').findOne({
        buyerId: new Types.ObjectId(userId),
        contentType: TrackableContentType.CHALLENGE,
        contentId: challenge._id.toString(),
        status: 'paid',
      }).session(session);

      if (!existingOrder) {
        if (this.isPaidOrderRequired()) {
          throw this.buildPaymentRequiredException({
            contentId: challenge._id.toString(),
            amount: price,
            initEndpoint: '/payment/stripe-link/init/challenge',
            message: 'Paiement requis pour rejoindre ce défi',
          });
        }

        const breakdown = await this.feeService.calculateForAmount(
          price,
          challenge.creatorId.toString(),
        );
        await (this.challengeModel as any).db.model('Order').create([{
          buyerId: new Types.ObjectId(userId),
          creatorId: challenge.creatorId,
          contentType: TrackableContentType.CHALLENGE,
          contentId: challenge._id.toString(),
          amountDT: breakdown.amountDT,
          platformPercent: breakdown.platformPercent,
          platformFixedDT: breakdown.platformFixedDT,
          platformFeeDT: breakdown.platformFeeDT,
          creatorNetDT: breakdown.creatorNetDT,
          status: 'paid',
        }], { session });
      }
    }

    // Ajouter le participant
    challenge.addParticipant(new Types.ObjectId(userId));
    await challenge.save({ session });

    // Fire tracking events for analytics rollups
    try {
      const trackingContentId = challenge.id || challenge._id.toString();
      await this.trackingService.trackView(
        userId,
        trackingContentId,
        TrackableContentType.CHALLENGE,
        { challengeTitle: challenge.title, communityId: challenge.communityId },
      );
      await this.trackingService.trackStart(
        userId,
        trackingContentId,
        TrackableContentType.CHALLENGE,
        { challengeTitle: challenge.title, communityId: challenge.communityId },
      );
      console.log(`✅ [CHALLENGE-SERVICE] Tracked view+start for user ${userId} on challenge ${trackingContentId}`);
    } catch (trackingError) {
      // Never break join flow because of tracking
      console.warn(`⚠️ [CHALLENGE-SERVICE] Tracking failed for joinChallenge:`, trackingError);
    }

    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    }).session(session);
    return this.transformToResponseDto(challenge, community || undefined);
  }

  /**
   * Quitter un défi
   */
  async leaveChallenge(
    leaveChallengeDto: LeaveChallengeDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(leaveChallengeDto.challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est participant
    if (!challenge.isParticipant(new Types.ObjectId(userId))) {
      throw new BadRequestException("Vous n'êtes pas participant à ce défi");
    }

    // Supprimer le participant
    challenge.removeParticipant(new Types.ObjectId(userId));
    await challenge.save();

    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    });
    return this.transformToResponseDto(challenge, community || undefined);
  }

  /**
   * Mettre à jour le progrès d'un participant
   */
  async updateProgress(
    updateProgressDto: UpdateProgressDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    console.log('🔄 [DEBUG-BACKEND] updateProgress called', {
      dto: updateProgressDto,
      userId,
      userIdType: typeof userId
    });

    try {
      const challenge = await this.findChallengeById(updateProgressDto.challengeId);
      if (!challenge) {
        console.warn(`⚠️ [DEBUG-BACKEND] Challenge not found: ${updateProgressDto.challengeId}`);
        throw new NotFoundException('Défi non trouvé');
      }

      console.log('✅ [DEBUG-BACKEND] Challenge found:', challenge.id);

      // Verify userId is valid for ObjectId
      let userObjectId: Types.ObjectId;
      try {
        userObjectId = new Types.ObjectId(userId);
      } catch (e) {
        console.error(`❌ [DEBUG-BACKEND] Invalid User ID format: ${userId}`);
        throw new BadRequestException('ID utilisateur invalide');
      }

      // Check participation
      // Safe check: ensure method exists
      if (typeof challenge.isParticipant !== 'function') {
        console.error('❌ [DEBUG-BACKEND] challenge.isParticipant is not a function. Check Schema compilation.');
        // Fallback manual check
        const isPart = challenge.participants && challenge.participants.some(p => p.userId.toString() === userId);
        if (!isPart) {
          throw new BadRequestException("Vous n'êtes pas participant à ce défi (fallback check)");
        }
      } else {
        if (!challenge.isParticipant(userObjectId)) {
          console.warn(`⚠️ [DEBUG-BACKEND] User ${userId} is not participant in ${challenge.id}`);
          throw new BadRequestException("Vous n'êtes pas participant à ce défi");
        }
      }

      // Find task
      const task = challenge.tasks?.find(
        (t) => t.id === updateProgressDto.taskId,
      );

      if (!task) {
        console.warn(`⚠️ [DEBUG-BACKEND] Task not found: ${updateProgressDto.taskId}`);
        console.log('📋 [DEBUG-BACKEND] Available task IDs:', challenge.tasks?.map(t => t.id));
        throw new NotFoundException('Tâche non trouvée');
      }

      console.log(`✅ [DEBUG-BACKEND] Updating task ${task.id} to ${updateProgressDto.status}`);

      // Update task status (Note: this updates the DEFINITION of the task, not just user progress?
      // WAIT: challenge.tasks[i].isCompleted is a global property?
      // Looking at Schema: ChallengeTask has isCompleted Boolean.
      // If this is set to true, it's completed for EVERYONE?
      // NO, this seems to be a schema flaw or specific design.
      // Usually task completion is tracked in participant.completedTasks array.
      // Modifying challenge.tasks global array might be wrong if it's per-user.)

      // Based on schema, 'completedTasks' in participant is the source of truth for user.
      // 'task.isCompleted' in ChallengeTask schema likely means "task is effectively done/closed for edit" or legacy?
      // Only modifying participant progress below is safe.

      // Update member's progress in participant list
      const participant = challenge.participants.find(
        (p) => String(p.userId) === String(userId) || (p.userId as any)._id?.toString() === String(userId),
      );

      if (participant) {
        if (
          updateProgressDto.status === 'completed' &&
          !participant.completedTasks.includes(updateProgressDto.taskId)
        ) {
          participant.completedTasks.push(updateProgressDto.taskId);
          participant.totalPoints = (participant.totalPoints || 0) + (task.points || 0);
        } else if (
          updateProgressDto.status !== 'completed' &&
          participant.completedTasks.includes(updateProgressDto.taskId)
        ) {
          participant.completedTasks = participant.completedTasks.filter(
            (id) => id !== updateProgressDto.taskId,
          );
          participant.totalPoints = Math.max(
            0,
            (participant.totalPoints || 0) - (task.points || 0),
          );
        }

        // Calculate progress percentage
        const totalTasksCount = challenge.tasks?.length || 1;
        participant.progress = Math.round(
          (participant.completedTasks.length / totalTasksCount) * 100
        );
        participant.lastActivityAt = new Date();

        console.log(`✅ [DEBUG-BACKEND] Updated participant progress: ${participant.progress}%`);
      } else {
        console.error(`❌ [DEBUG-BACKEND] Participant object not found for user ${userId}`);
        throw new BadRequestException('Participant introuvable');
      }

      // Save using Mongoose
      try {
        await challenge.save();
        console.log('✅ [DEBUG-BACKEND] Challenge saved successfully');
      } catch (saveError) {
        console.error('❌ [DEBUG-BACKEND] Error saving challenge:', saveError);
        throw new BadRequestException('Erreur lors de la sauvegarde du progrès: ' + saveError.message);
      }

      // Fire tracking events for analytics
      try {
        const trackingContentId = challenge.id || challenge._id.toString();
        const totalTasksCount = challenge.tasks?.length || 1;

        // Task-level tracking with metadata.taskId for funnel analytics
        if (updateProgressDto.status === 'completed') {
          await this.trackingService.trackAction(
            userId,
            trackingContentId,
            TrackableContentType.CHALLENGE,
            TrackingActionType.COMPLETE,
            {
              taskId: updateProgressDto.taskId,
              taskTitle: task?.title,
              communityId: challenge.communityId,
              completedTasks: participant?.completedTasks?.length || 0,
              totalTasks: totalTasksCount,
            },
          );
        } else {
          await this.trackingService.trackAction(
            userId,
            trackingContentId,
            TrackableContentType.CHALLENGE,
            TrackingActionType.START,
            {
              taskId: updateProgressDto.taskId,
              taskTitle: task?.title,
              communityId: challenge.communityId,
            },
          );
        }

        // Challenge-level completion when all tasks are done
        if (participant && participant.progress >= 100) {
          await this.trackingService.trackComplete(
            userId,
            trackingContentId,
            TrackableContentType.CHALLENGE,
            {
              communityId: challenge.communityId,
              completedTasks: participant.completedTasks.length,
              totalTasks: totalTasksCount,
            },
          );
          console.log(`✅ [CHALLENGE-SERVICE] User ${userId} completed all tasks in challenge ${trackingContentId}`);
        }
      } catch (trackingError) {
        // Never break progress flow because of tracking
        console.warn(`⚠️ [CHALLENGE-SERVICE] Tracking failed for updateProgress:`, trackingError);
      }

      const community = await this.communityModel.findOne({
        id: challenge.communityId,
      });
      return this.transformToResponseDto(challenge, community || undefined);

    } catch (error) {
      console.error('💥 [DEBUG-BACKEND] Exception in updateProgress:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('Erreur interne lors de la mise à jour: ' + (error.message || error));
    }
  }

  /**
   * Créer un post dans un défi
   */
  async createPost(
    challengeId: string,
    createPostDto: CreateChallengePostDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est participant
    if (!challenge.isParticipant(new Types.ObjectId(userId))) {
      throw new BadRequestException(
        'Seuls les participants peuvent créer des posts',
      );
    }

    const post = {
      id: new Types.ObjectId().toString(),
      content: createPostDto.content,
      images: createPostDto.images || [],
      userId: new Types.ObjectId(userId),
      likes: 0,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    challenge.addPost(post);
    await challenge.save();

    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    });
    return this.transformToResponseDto(challenge, community || undefined);
  }

  /**
   * Commenter un post de défi
   */
  async commentPost(
    challengeId: string,
    postId: string,
    createCommentDto: CreateChallengeCommentDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est participant
    if (!challenge.isParticipant(new Types.ObjectId(userId))) {
      throw new BadRequestException('Seuls les participants peuvent commenter');
    }

    const post = challenge.posts.find((p) => p.id === postId);
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const comment = {
      id: new Types.ObjectId().toString(),
      content: createCommentDto.content,
      userId: new Types.ObjectId(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    post.comments.push(comment);
    await challenge.save();

    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    });
    return this.transformToResponseDto(challenge, community || undefined);
  }

  /**
   * Transformer un document Challenge en DTO de réponse
   */
  private async transformToResponseDto(
    challenge: ChallengeDocument,
    community?: CommunityDocument | null,
  ): Promise<ChallengeResponseDto> {
    // Récupérer les informations du créateur
    const creator = await this.userModel
      .findById(challenge.creatorId)
      .select('name email profile_picture photo_profil');

    // Récupérer les informations des participants
    const participantUserIds = challenge.participants.map((p) => p.userId);
    const participantUsers = await this.userModel
      .find({ _id: { $in: participantUserIds } })
      .select('name email profile_picture photo_profil');

    // Transformer les participants
    const participants = challenge.participants.map((participant) => {
      const user = participantUsers.find((u) =>
        u._id.equals(participant.userId),
      );
      return {
        id: participant.id,
        oderId: participant.id, // Use id as oderId for compatibility
        userId: participant.userId.toString(),
        userName: user?.name || 'Utilisateur inconnu',
        userAvatar: this.uploadService.ensureAbsoluteUrl(user?.profile_picture || user?.photo_profil),
        joinedAt: participant.joinedAt.toISOString(),
        isActive: participant.isActive,
        progress: participant.progress,
        totalPoints: participant.totalPoints,
        completedTasks: participant.completedTasks,
        lastActivityAt: participant.lastActivityAt.toISOString(),
      };
    });

    // Transformer les posts
    const postUserIds = challenge.posts.map((p) => p.userId);
    const postUsers = await this.userModel
      .find({ _id: { $in: postUserIds } })
      .select('name email profile_picture photo_profil');

    const posts = challenge.posts.map((post) => {
      const user = postUsers.find((u) => u._id.equals(post.userId));

      // Transformer les commentaires
      const commentUserIds = post.comments.map((c) => c.userId);
      const commentUsers = postUsers.filter((u) =>
        commentUserIds.some((id) => id.equals(u._id)),
      );

      const comments = post.comments.map((comment) => {
        const commentUser = commentUsers.find((u) =>
          u._id.equals(comment.userId),
        );
        return {
          id: comment.id,
          content: comment.content,
          userId: comment.userId.toString(),
          userName: commentUser?.name || 'Utilisateur inconnu',
          userAvatar: this.uploadService.ensureAbsoluteUrl(commentUser?.profile_picture || commentUser?.photo_profil),
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        };
      });

      return {
        id: post.id,
        content: post.content,
        images: post.images,
        userId: post.userId.toString(),
        userName: user?.name || 'Utilisateur inconnu',
        userAvatar: this.uploadService.ensureAbsoluteUrl(user?.profile_picture || user?.photo_profil),
        likes: post.likes,
        comments: comments,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      };
    });

    const now = new Date();
    const isOngoing =
      challenge.isActive &&
      challenge.startDate <= now &&
      challenge.endDate >= now;
    const isCompleted = challenge.endDate < now;

    return {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      communityId: challenge.communityId,
      communitySlug: community?.slug || '',
      community: community ? {
        id: community.id,
        name: community.name,
        slug: community.slug,
      } : undefined,
      creatorId: challenge.creatorId.toString(),
      creatorName: creator?.name || 'Créateur inconnu',
      creatorAvatar: this.uploadService.ensureAbsoluteUrl(creator?.profile_picture || creator?.photo_profil) || undefined,
      startDate: challenge.startDate.toISOString(),
      endDate: challenge.endDate.toISOString(),
      isActive: challenge.isActive,
      sequentialProgression: challenge.sequentialProgression ?? false,
      unlockMessage: challenge.unlockMessage,
      participants: participants,
      posts: posts,
      createdAt: challenge.createdAt.toISOString(),
      updatedAt: challenge.updatedAt.toISOString(),
      depositAmount: challenge.depositAmount,
      maxParticipants: challenge.maxParticipants,
      completionReward: challenge.completionReward,
      topPerformerBonus: challenge.topPerformerBonus,
      streakBonus: challenge.streakBonus,
      category: challenge.category,
      difficulty: challenge.difficulty,
      duration: challenge.duration,
      thumbnail: challenge.thumbnail,
      notes: challenge.notes,
      resources: (challenge.resources || []).map((resource: any) => ({
        ...(resource as any),
        url: this.uploadService.ensureAbsoluteUrl(resource?.url),
      })),
      tasks: (challenge.tasks || []).map((task) => {
        const taskIdRaw = (task as any).id || (task as any)._id;
        const taskId = taskIdRaw ? String(taskIdRaw) : '';
        return {
          id: taskId,
          day: task.day,
          title: task.title,
          description: task.description,
          deliverable: task.deliverable,
          isCompleted: task.isCompleted,
          isActive: task.isActive,
          points: task.points,
          instructions: task.instructions,
          notes: task.notes,
          resources: (task.resources || []).map((resource: any) => ({
            ...(resource as any),
            url: this.uploadService.ensureAbsoluteUrl(resource?.url),
          })),
          createdAt: task.createdAt?.toISOString?.() || new Date(task.createdAt).toISOString(),
        };
      }),
      participantCount: challenge.participants.length,
      isOngoing: isOngoing,
      isCompleted: isCompleted,

      // Informations de pricing
      // Use participationFee if set, otherwise fall back to depositAmount for backward compatibility
      participationFee: challenge.pricing?.participationFee || challenge.depositAmount || 0,
      currency: challenge.pricing?.currency,
      depositRequired: challenge.pricing?.depositRequired,
      isPremium: challenge.pricing?.isPremium,
      premiumFeatures: challenge.pricing?.premiumFeatures,
      paymentOptions: challenge.pricing?.paymentOptions,
      freeTrialDays: challenge.pricing?.freeTrialDays,
      trialFeatures: challenge.pricing?.trialFeatures,
      // Challenge is free only if both participationFee and depositAmount are 0 or undefined
      isFree: (challenge.pricing?.participationFee || challenge.depositAmount || 0) === 0,
      finalPrice: challenge.pricing?.participationFee || challenge.depositAmount || 0,
    };
  }

  // ============= MÉTHODES DE PRICING =============

  /**
   * Mettre à jour la configuration de prix d'un défi
   */
  async updatePricing(
    challengeId: string,
    pricingDto: UpdateChallengePricingDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    // Vérifier que l'utilisateur est le créateur du défi
    if (challenge.creatorId.toString() !== userId) {
      throw new ForbiddenException(
        'Seul le créateur du défi peut modifier la configuration de prix',
      );
    }

    // Mettre à jour la configuration de prix
    if (!challenge.pricing) {
      challenge.pricing = {
        price: 0,
        priceType: 'free',
        isRecurring: false,
        participationFee: 0,
        currency: 'TND',
        depositRequired: false,
        isPremium: false,
        premiumFeatures: {
          personalMentoring: false,
          exclusiveResources: false,
          priorityFeedback: false,
          certificate: false,
          liveSessions: false,
          communityAccess: false,
        },
        features: [],
        paymentOptions: {
          allowInstallments: false,
        },
      };
    }

    // Mettre à jour les champs fournis
    if (pricingDto.participationFee !== undefined) {
      challenge.pricing!.participationFee = pricingDto.participationFee;
      challenge.pricing!.price = pricingDto.participationFee; // Sync price with participation fee
      challenge.pricing!.priceType = pricingDto.participationFee > 0 ? 'one-time' : 'free';
    }
    if (pricingDto.currency !== undefined) {
      challenge.pricing!.currency = pricingDto.currency;
    }
    if (pricingDto.depositAmount !== undefined) {
      challenge.pricing!.depositAmount = pricingDto.depositAmount;
    }
    if (pricingDto.depositRequired !== undefined) {
      challenge.pricing!.depositRequired = pricingDto.depositRequired;
    }
    if (pricingDto.isPremium !== undefined) {
      challenge.pricing!.isPremium = pricingDto.isPremium;
    }
    if (pricingDto.completionReward !== undefined) {
      challenge.pricing!.completionReward = pricingDto.completionReward;
    }
    if (pricingDto.topPerformerBonus !== undefined) {
      challenge.pricing!.topPerformerBonus = pricingDto.topPerformerBonus;
    }
    if (pricingDto.streakBonus !== undefined) {
      challenge.pricing!.streakBonus = pricingDto.streakBonus;
    }
    if (pricingDto.premiumFeatures !== undefined) {
      challenge.pricing!.premiumFeatures = {
        ...challenge.pricing!.premiumFeatures,
        ...pricingDto.premiumFeatures,
      };
    }
    if (pricingDto.paymentOptions !== undefined) {
      challenge.pricing!.paymentOptions = {
        ...challenge.pricing!.paymentOptions,
        ...pricingDto.paymentOptions,
      };
    }
    if (pricingDto.freeTrialDays !== undefined) {
      challenge.pricing!.freeTrialDays = pricingDto.freeTrialDays;
    }
    if (pricingDto.trialFeatures !== undefined) {
      challenge.pricing!.trialFeatures = pricingDto.trialFeatures;
    }

    const updatedChallenge = await challenge.save();
    const community = await this.communityModel.findOne({
      id: challenge.communityId,
    });

    return this.transformToResponseDto(
      updatedChallenge,
      community || undefined,
    );
  }

  /**
   * Calculer le prix d'un défi avec remises
   */
  async calculatePrice(
    calculatePriceDto: CalculateChallengePriceDto,
  ): Promise<ChallengePriceCalculationResponseDto> {
    const challenge = await this.findChallengeById(calculatePriceDto.challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    if (!challenge.pricing) {
      return {
        basePrice: 0,
        currency: 'USD',
        discountPercentage: 0,
        discountAmount: 0,
        finalPrice: 0,
        appliedDiscountType: 'none',
        isFree: true,
      };
    }

    const basePrice = challenge.pricing.participationFee;
    const currency = challenge.pricing.currency;
    let discountPercentage = 0;
    let appliedDiscountType = 'none';

    // Calculer les remises selon le type d'utilisateur
    if (calculatePriceDto.userType && challenge.pricing.paymentOptions) {
      switch (calculatePriceDto.userType) {
        case 'early-bird':
          discountPercentage =
            challenge.pricing.paymentOptions.earlyBirdDiscount || 0;
          appliedDiscountType = 'early-bird';
          break;
        case 'group':
          discountPercentage =
            challenge.pricing.paymentOptions.groupDiscount || 0;
          appliedDiscountType = 'group';
          break;
        case 'member':
          discountPercentage =
            challenge.pricing.paymentOptions.memberDiscount || 0;
          appliedDiscountType = 'member';
          break;
        default:
          discountPercentage = 0;
          appliedDiscountType = 'none';
      }
    }

    const discountAmount = (basePrice * discountPercentage) / 100;
    const finalPrice = basePrice - discountAmount;

    const result: ChallengePriceCalculationResponseDto = {
      basePrice,
      currency,
      discountPercentage,
      discountAmount,
      finalPrice,
      appliedDiscountType,
      isFree: basePrice === 0,
    };

    // Ajouter les informations sur le dépôt si applicable
    if (challenge.pricing.depositRequired && challenge.pricing.depositAmount) {
      result.depositAmount = challenge.pricing.depositAmount;
    }

    // Ajouter les informations sur les paiements échelonnés si applicable
    if (
      challenge.pricing.paymentOptions?.allowInstallments &&
      challenge.pricing.paymentOptions.installmentCount
    ) {
      result.installmentCount =
        challenge.pricing.paymentOptions.installmentCount;
      result.installmentAmount =
        finalPrice / challenge.pricing.paymentOptions.installmentCount;
    }

    return result;
  }

  /**
   * Vérifier l'accès d'un utilisateur à un défi
   */
  async checkAccess(
    checkAccessDto: CheckChallengeAccessDto,
  ): Promise<ChallengeAccessResponseDto> {
    const challenge = await this.findChallengeById(checkAccessDto.challengeId);
    if (!challenge) {
      throw new NotFoundException('Défi non trouvé');
    }

    const user = await this.userModel.findById(checkAccessDto.userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const isFree = challenge.isFreeChallenge();
    const hasPaid = false; // TODO: Implémenter la vérification du paiement

    let hasAccess = false;
    let reason = '';
    let trialDaysRemaining: number | undefined;

    if (isFree) {
      hasAccess = true;
      reason = 'Challenge is free';
    } else if (hasPaid) {
      hasAccess = true;
      reason = 'User has paid for challenge';
    } else if (
      challenge.pricing?.freeTrialDays &&
      challenge.pricing.freeTrialDays > 0
    ) {
      // Vérifier si l'utilisateur est dans la période d'essai
      const now = new Date();
      const trialEndDate = new Date(
        challenge.startDate.getTime() +
        challenge.pricing.freeTrialDays * 24 * 60 * 60 * 1000,
      );

      if (now <= trialEndDate) {
        hasAccess = true;
        reason = 'User is in free trial period';
        trialDaysRemaining = Math.ceil(
          (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      } else {
        hasAccess = false;
        reason = 'Free trial period has expired';
      }
    } else {
      hasAccess = false;
      reason = 'User has not paid for challenge';
    }

    return {
      hasAccess,
      reason,
      isFree,
      hasPaid,
      trialDaysRemaining,
      trialFeatures: challenge.pricing?.trialFeatures,
      priceToPay: hasAccess ? undefined : challenge.pricing?.participationFee,
      currency: challenge.pricing?.currency,
    };
  }

  /**
   * Obtenir les défis gratuits
   */
  async findFreeChallenges(
    page: number = 1,
    limit: number = 10,
    communitySlug?: string,
  ): Promise<ChallengeListResponseDto> {
    const query: any = {
      $or: [
        { 'pricing.participationFee': 0 },
        { 'pricing.participationFee': { $exists: false } },
        { pricing: { $exists: false } },
      ],
    };

    if (communitySlug) {
      const community = await this.communityModel.findOne({
        slug: communitySlug,
      });
      if (community) {
        query.communityId = community.id;
      }
    }

    const skip = (page - 1) * limit;

    const [challenges, total] = await Promise.all([
      this.challengeModel
        .find(query)
        .populate('creatorId', 'name email avatar profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.challengeModel.countDocuments(query),
    ]);

    const communityIds = [...new Set(challenges.map((c) => c.communityId))];
    const communities = await this.communityModel.find({
      _id: { $in: communityIds.map(id => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id) },
    });

    const challengeResponses = await Promise.all(
      challenges.map((challenge) => {
        const community = communities.find(
          (c) => c._id.toString() === challenge.communityId.toString(),
        );
        return this.transformToResponseDto(challenge, community || undefined);
      }),
    );

    return {
      challenges: challengeResponses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtenir les défis premium
   */
  async findPremiumChallenges(
    page: number = 1,
    limit: number = 10,
    communitySlug?: string,
  ): Promise<ChallengeListResponseDto> {
    const query: any = {
      'pricing.isPremium': true,
    };

    if (communitySlug) {
      const community = await this.communityModel.findOne({
        slug: communitySlug,
      });
      if (community) {
        query.communityId = community.id;
      }
    }

    const skip = (page - 1) * limit;

    const [challenges, total] = await Promise.all([
      this.challengeModel
        .find(query)
        .populate('creatorId', 'name email avatar profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.challengeModel.countDocuments(query),
    ]);

    const communityIds = [...new Set(challenges.map((c) => c.communityId))];
    const communities = await this.communityModel.find({
      _id: { $in: communityIds.map(id => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id) },
    });

    const challengeResponses = await Promise.all(
      challenges.map((challenge) => {
        const community = communities.find(
          (c) => c._id.toString() === challenge.communityId.toString(),
        );
        return this.transformToResponseDto(challenge, community || undefined);
      }),
    );

    return {
      challenges: challengeResponses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============ TRACKING METHODS ============

  /**
   * Track challenge view with real-time analytics rollup and GA4
   */
  async trackChallengeView(challengeId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`👁️ [CHALLENGE-TRACKING] View: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.trackView(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      metadata
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          {
            $inc: { views: 1 },
            $addToSet: { uniqueUsers: new Types.ObjectId(userId) },
            $set: { contentTitle: challenge.title }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed view rollup:', err.message);
      }
    }

    // GA4 Event with proper event name mapping
    void this.ga4Service.sendEvent({
      userId,
      name: 'content_view',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        category: challenge.category,
        difficulty: challenge.difficulty,
        ...metadata
      }
    });

    return { success: true, message: 'View tracked' };
  }

  /**
   * Track challenge start (participant joins) with real-time analytics rollup and GA4
   */
  async trackChallengeStart(challengeId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`🚀 [CHALLENGE-TRACKING] Start: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.trackStart(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      metadata
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          {
            $inc: { starts: 1 },
            $addToSet: { uniqueUsers: new Types.ObjectId(userId) },
            $set: { contentTitle: challenge.title }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed start rollup:', err.message);
      }
    }

    // GA4 Event with proper event name mapping
    void this.ga4Service.sendEvent({
      userId,
      name: 'content_start',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        category: challenge.category,
        difficulty: challenge.difficulty,
        ...metadata
      }
    });

    return { success: true, message: 'Start tracked' };
  }

  /**
   * Track task completion (submission) with real-time analytics rollup and GA4
   */
  async trackTaskComplete(challengeId: string, taskId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`✅ [CHALLENGE-TRACKING] Task Complete: challenge=${challengeId}, task=${taskId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Find task details
    const task = challenge.tasks?.find(t =>
      (t.id && String(t.id) === String(taskId)) ||
      (t.day && String(t.day) === String(taskId))
    );

    // Record tracking action
    await this.trackingService.trackAction(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      TrackingActionType.COMPLETE,
      {
        taskId,
        task_id: taskId,
        day: task?.day,
        actionSubType: 'task_complete',
        ...metadata
      }
    );

    // Real-time rollup into AnalyticsDaily (increments completes as submissions)
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          {
            $inc: { completes: 1 },
            $addToSet: { uniqueUsers: new Types.ObjectId(userId) },
            $set: { contentTitle: challenge.title }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed task complete rollup:', err.message);
      }
    }

    // GA4 Event with proper event name mapping
    void this.ga4Service.sendEvent({
      userId,
      name: 'challenge_task_complete',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_id: trackingId,
        task_id: taskId,
        day: task?.day,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        category: challenge.category,
        difficulty: challenge.difficulty,
        ...metadata
      }
    });

    return { success: true, message: 'Task completion tracked' };
  }

  /**
   * Track challenge complete (all tasks finished) with real-time analytics rollup and GA4
   * Authoritative - only emits when all tasks are verified complete
   */
  async trackChallengeComplete(challengeId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`🏆 [CHALLENGE-TRACKING] Challenge Complete: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Verify all tasks are completed (authoritative check)
    const participant = challenge.participants?.find(p =>
      String(p.userId) === String(userId) ||
      (p.userId as any)._id?.toString() === String(userId)
    );

    if (!participant) {
      throw new BadRequestException('User is not a participant of this challenge');
    }

    const totalTasks = challenge.tasks?.length || 0;
    const completedTasks = participant.completedTasks?.length || 0;

    // Guardrail: Only allow completion tracking if all tasks are done
    if (completedTasks < totalTasks) {
      throw new BadRequestException(
        `Cannot mark challenge as complete. Only ${completedTasks}/${totalTasks} tasks completed.`
      );
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.trackComplete(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      {
        completedTasks,
        totalTasks,
        progress: 100,
        ...metadata
      }
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        // Note: We don't increment completes here as it's already counted in task completion
        // Instead, we track unique completers
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          {
            $addToSet: { completedUsers: new Types.ObjectId(userId) },
            $set: { contentTitle: challenge.title }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed challenge complete rollup:', err.message);
      }
    }

    // GA4 Event with proper event name mapping
    void this.ga4Service.sendEvent({
      userId,
      name: 'content_complete',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        category: challenge.category,
        difficulty: challenge.difficulty,
        completed_tasks: completedTasks,
        total_tasks: totalTasks,
        completion_reward: challenge.completionReward || 0,
        ...metadata
      }
    });

    return {
      success: true,
      message: 'Challenge completion tracked',
      data: {
        completedTasks,
        totalTasks,
        progress: 100
      }
    };
  }

  /**
   * Track challenge like with real-time analytics rollup and GA4
   */
  async trackChallengeLike(challengeId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`❤️ [CHALLENGE-TRACKING] Like: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.trackLike(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      metadata
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          { $inc: { likes: 1 } },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed like rollup:', err.message);
      }
    }

    // GA4 Event
    void this.ga4Service.sendEvent({
      userId,
      name: 'challenge_like',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        ...metadata
      }
    });

    return { success: true, message: 'Like tracked' };
  }

  /**
   * Track challenge share with real-time analytics rollup and GA4
   */
  async trackChallengeShare(challengeId: string, userId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`🔗 [CHALLENGE-TRACKING] Share: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.trackShare(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      metadata
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          { $inc: { shares: 1 } },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed share rollup:', err.message);
      }
    }

    // GA4 Event
    void this.ga4Service.sendEvent({
      userId,
      name: 'challenge_share',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        share_method: metadata.shareMethod || 'unknown',
        ...metadata
      }
    });

    return { success: true, message: 'Share tracked' };
  }

  /**
   * Track challenge bookmark with real-time analytics rollup and GA4
   */
  async addChallengeBookmark(challengeId: string, userId: string, bookmarkId: string, metadata: Record<string, any> = {}): Promise<any> {
    console.log(`🔖 [CHALLENGE-TRACKING] Bookmark: challenge=${challengeId}, user=${userId}`);

    const challenge = await this.findChallengeById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Use custom challenge id for consistent analytics
    const trackingId = challenge.id || challengeId;

    // Record tracking action
    await this.trackingService.addBookmark(
      userId,
      trackingId,
      TrackableContentType.CHALLENGE,
      bookmarkId
    );

    // Real-time rollup into AnalyticsDaily
    if (challenge.creatorId) {
      const todayUTC = new Date();
      const dayStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate()));

      try {
        await this.analyticsDailyModel.updateOne(
          {
            creatorId: challenge.creatorId,
            contentType: 'challenge',
            contentId: trackingId,
            communityId: challenge.communityId,
            date: dayStart
          },
          { $inc: { bookmarks: 1 } },
          { upsert: true }
        );
      } catch (err) {
        console.error('⚠️ [CHALLENGE-TRACKING] Failed bookmark rollup:', err.message);
      }
    }

    // GA4 Event
    void this.ga4Service.sendEvent({
      userId,
      name: 'challenge_bookmark',
      params: {
        content_type: 'challenge',
        content_id: trackingId,
        challenge_title: challenge.title,
        community_id: challenge.communityId,
        creator_id: challenge.creatorId?.toString(),
        bookmark_id: bookmarkId,
        ...metadata
      }
    });

    return { success: true, message: 'Bookmark added' };
  }

  /**
   * Retirer un bookmark d'un défi
   */
  async removeChallengeBookmark(
    challengeId: string,
    userId: string,
    bookmarkId: string,
  ) {
    return await this.trackingService.removeBookmark(
      userId,
      challengeId,
      TrackableContentType.CHALLENGE,
      bookmarkId,
    );
  }

  /**
   * Ajouter une note/évaluation d'un défi
   */
  async addChallengeRating(
    challengeId: string,
    userId: string,
    rating: number,
    review?: string,
  ) {
    return await this.trackingService.addRating(
      userId,
      challengeId,
      TrackableContentType.CHALLENGE,
      rating,
      review,
    );
  }

  /**
   * Obtenir la progression d'un utilisateur pour un défi
   */
  async getChallengeProgress(challengeId: string, userId: string) {
    return await this.trackingService.getProgress(
      userId,
      challengeId,
      TrackableContentType.CHALLENGE,
    );
  }

  /**
   * Obtenir les statistiques d'un défi
   */
  async getChallengeStats(challengeId: string) {
    return await this.trackingService.getContentStats(
      challengeId,
      TrackableContentType.CHALLENGE,
    );
  }

  // ============ SEQUENTIAL PROGRESSION METHODS ============

  /**
   * Activer ou désactiver la progression séquentielle d'un défi
   * @param challengeId ID du défi
   * @param enabled Activer ou désactiver
   * @param unlockMessage Message personnalisé pour les tâches verrouillées
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @returns Défi mis à jour
   */
  async updateSequentialProgression(
    challengeId: string,
    enabled: boolean,
    unlockMessage: string | undefined,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    console.log('🔧 DEBUG - updateSequentialProgression (Challenge)');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   🔒 Enabled: ${enabled}`);
    console.log(`   💬 Unlock Message: ${unlockMessage}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Vérifier que le défi existe
      const challenge = await this.findChallengeById(challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Vérifier que l'utilisateur est le créateur du défi
      if (challenge.creatorId.toString() !== userId) {
        throw new ForbiddenException(
          'Seul le créateur du défi peut modifier la progression séquentielle',
        );
      }

      // 3. Mettre à jour la progression séquentielle
      if (enabled) {
        challenge.activerProgressionSequentielle(unlockMessage);
      } else {
        challenge.desactiverProgressionSequentielle();
      }

      const challengeEnregistre = await challenge.save();

      console.log('   ✅ Progression séquentielle mise à jour avec succès');
      console.log(
        `   🔒 Sequential Progression: ${challengeEnregistre.sequentialProgression}`,
      );

      const community = await this.communityModel.findOne({
        id: challenge.communityId,
      });
      return this.transformToResponseDto(
        challengeEnregistre,
        community || undefined,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error(
        '❌ Erreur lors de la mise à jour de la progression séquentielle:',
        error,
      );
      throw new BadRequestException(
        'Erreur lors de la mise à jour de la progression séquentielle',
      );
    }
  }

  /**
   * Vérifier l'accès à une tâche avec la progression séquentielle
   * @param challengeId ID du défi
   * @param taskId ID de la tâche
   * @param userId ID de l'utilisateur
   * @returns Informations sur l'accès à la tâche
   */
  async checkTaskAccessWithSequential(
    challengeId: string,
    taskId: string,
    userId: string,
  ): Promise<{
    hasAccess: boolean;
    reason: string;
    requiredTask?: {
      id: string;
      title: string;
      day: number;
    };
    unlockMessage?: string;
    nextTask?: {
      id: string;
      title: string;
      day: number;
    };
  }> {
    console.log('🔧 DEBUG - checkTaskAccessWithSequential');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   📄 Task ID: ${taskId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Récupérer le défi
      const challenge = await this.findChallengeById(challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Vérifier que l'utilisateur est participant
      if (!challenge.isParticipant(new Types.ObjectId(userId))) {
        throw new NotFoundException('Utilisateur non participant à ce défi');
      }

      // 3. Récupérer les tâches complétées par l'utilisateur
      const participant = challenge.participants.find(
        (p) => p.userId.toString() === userId,
      );
      if (!participant) {
        throw new NotFoundException('Participant non trouvé');
      }

      // 4. Utiliser la méthode du schéma pour vérifier l'accès
      const accessCheck = challenge.verifierAccesTache(
        taskId,
        participant.completedTasks,
      );

      // 5. Obtenir la tâche suivante si disponible
      const nextTask = challenge.obtenirTacheSuivante(taskId);

      console.log("   ✅ Vérification d'accès terminée");
      console.log(`   🔓 Has Access: ${accessCheck.hasAccess}`);
      console.log(`   📝 Reason: ${accessCheck.reason}`);

      return {
        hasAccess: accessCheck.hasAccess,
        reason: accessCheck.reason,
        requiredTask: accessCheck.requiredTask
          ? {
            id: accessCheck.requiredTask.id,
            title: accessCheck.requiredTask.title,
            day: accessCheck.requiredTask.day,
          }
          : undefined,
        unlockMessage: challenge.unlockMessage,
        nextTask: nextTask
          ? {
            id: nextTask.id,
            title: nextTask.title,
            day: nextTask.day,
          }
          : undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error(
        "❌ Erreur lors de la vérification d'accès à la tâche:",
        error,
      );
      throw new BadRequestException(
        "Erreur lors de la vérification d'accès à la tâche",
      );
    }
  }

  /**
   * Obtenir les tâches déverrouillées pour un utilisateur
   * @param challengeId ID du défi
   * @param userId ID de l'utilisateur
   * @returns Liste des tâches déverrouillées
   */
  async getUnlockedTasks(
    challengeId: string,
    userId: string,
  ): Promise<{
    unlockedTasks: Array<{
      id: string;
      title: string;
      day: number;
      isCompleted: boolean;
      isUnlocked: boolean;
    }>;
    sequentialProgressionEnabled: boolean;
    unlockMessage?: string;
  }> {
    console.log('🔧 DEBUG - getUnlockedTasks');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Récupérer le défi
      const challenge = await this.findChallengeById(challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Récupérer le participant si l'utilisateur est connecté
      const userIdStr = String(userId);
      const participant = challenge.participants.find(
        (p) => p.userId.toString() === userIdStr,
      );

      // 3. Extraire les tâches complétées (vide si non participant)
      const completedTaskIds = participant ? participant.completedTasks : [];

      // 4. Construire la liste des tâches avec leur statut
      const unlockedTasks: Array<{
        id: string;
        title: string;
        day: number;
        isCompleted: boolean;
        isUnlocked: boolean;
      }> = [];

      // Trier les tâches par jour
      const tasksTriees = [...(challenge.tasks || [])].sort(
        (a, b) => a.day - b.day,
      );

      for (const task of tasksTriees) {
        // Vérifier si la tâche est complétée
        const isCompleted = completedTaskIds.includes(task.id);

        // Vérifier si la tâche est déverrouillée
        let isUnlocked = true;
        if (challenge.sequentialProgression) {
          const accessCheck = challenge.verifierAccesTache(
            task.id,
            completedTaskIds,
          );
          isUnlocked = accessCheck.hasAccess;
        }

        unlockedTasks.push({
          id: task.id,
          title: task.title,
          day: task.day,
          isCompleted,
          isUnlocked,
        });
      }

      console.log(`   ✅ ${unlockedTasks.length} tâches analysées`);
      console.log(
        `   🔓 ${unlockedTasks.filter((t) => t.isUnlocked).length} tâches déverrouillées`,
      );

      return {
        unlockedTasks,
        sequentialProgressionEnabled: challenge.sequentialProgression,
        unlockMessage: challenge.unlockMessage,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error(
        '❌ Erreur lors de la récupération des tâches déverrouillées:',
        error,
      );
      throw new BadRequestException(
        'Erreur lors de la récupération des tâches déverrouillées',
      );
    }
  }

  /**
   * Déverrouiller manuellement une tâche (pour les créateurs/admins)
   * @param challengeId ID du défi
   * @param taskId ID de la tâche à déverrouiller
   * @param userId ID de l'utilisateur cible
   * @param creatorId ID du créateur/admin qui effectue l'action
   * @returns Message de confirmation
   */
  async unlockTaskManually(
    challengeId: string,
    taskId: string,
    userId: string,
    creatorId: string,
  ): Promise<{ message: string }> {
    console.log('🔧 DEBUG - unlockTaskManually');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   📄 Task ID: ${taskId}`);
    console.log(`   👤 Target User ID: ${userId}`);
    console.log(`   👨‍💼 Creator ID: ${creatorId}`);

    try {
      // 1. Vérifier que le défi existe
      const challenge = await this.findChallengeById(challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Vérifier que le créateur est le créateur du défi
      if (challenge.creatorId.toString() !== creatorId) {
        throw new ForbiddenException(
          'Seul le créateur du défi peut déverrouiller des tâches',
        );
      }

      // 3. Vérifier que l'utilisateur est participant
      if (!challenge.isParticipant(new Types.ObjectId(userId))) {
        throw new NotFoundException('Utilisateur non participant à ce défi');
      }

      // 4. Trouver le participant
      const participant = challenge.participants.find(
        (p) => p.userId.toString() === userId,
      );
      if (!participant) {
        throw new NotFoundException('Participant non trouvé');
      }

      // 5. Marquer la tâche comme accessible (mais pas forcément complétée)
      // On ne l'ajoute pas aux completedTasks, on la laisse accessible
      participant.lastActivityAt = new Date();
      await challenge.save();

      console.log('   ✅ Tâche déverrouillée manuellement avec succès');

      return {
        message: 'Tâche déverrouillée avec succès',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error(
        '❌ Erreur lors du déverrouillage manuel de la tâche:',
        error,
      );
      throw new BadRequestException(
        'Erreur lors du déverrouillage manuel de la tâche',
      );
    }
  }

  /**
   * Mettre à jour le progrès d'un participant avec vérification séquentielle
   * @param updateProgressDto Données de mise à jour du progrès
   * @param userId ID de l'utilisateur
   * @returns Défi mis à jour
   */
  async updateProgressWithSequential(
    updateProgressDto: UpdateProgressDto,
    userId: string,
  ): Promise<ChallengeResponseDto> {
    console.log('🔧 DEBUG - updateProgressWithSequential');
    console.log(`   📋 Challenge ID: ${updateProgressDto.challengeId}`);
    console.log(`   📄 Task ID: ${updateProgressDto.taskId}`);
    console.log(`   📊 Status: ${updateProgressDto.status}`);
    console.log(`   👤 User ID: ${userId}`);

    try {
      // 1. Récupérer le défi
      const challenge = await this.findChallengeById(updateProgressDto.challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Vérifier que l'utilisateur est participant
      if (!challenge.isParticipant(new Types.ObjectId(userId))) {
        throw new BadRequestException("Vous n'êtes pas participant à ce défi");
      }

      // 3. Trouver la tâche
      const task = challenge.tasks?.find(
        (t) => t.id === updateProgressDto.taskId,
      );
      if (!task) {
        throw new NotFoundException('Tâche non trouvée');
      }

      // 4. Si la progression séquentielle est activée, vérifier l'accès
      if (challenge.sequentialProgression) {
        const participant = challenge.participants.find(
          (p) => p.userId.toString() === userId,
        );
        if (participant) {
          const accessCheck = challenge.verifierAccesTache(
            updateProgressDto.taskId,
            participant.completedTasks,
          );
          if (!accessCheck.hasAccess) {
            throw new ForbiddenException(
              `Vous devez compléter la tâche précédente pour accéder à cette tâche: ${accessCheck.requiredTask?.title}`,
            );
          }
        }
      }

      // 5. Mettre à jour le statut de la tâche
      if (updateProgressDto.status === 'completed') {
        task.isCompleted = true;
      } else if (updateProgressDto.status === 'in_progress') {
        task.isCompleted = false;
      } else {
        task.isCompleted = false;
      }

      // 6. Mettre à jour le progrès du participant
      const participant = challenge.participants.find(
        (p) => p.userId.toString() === userId,
      );
      if (participant) {
        if (
          updateProgressDto.status === 'completed' &&
          !participant.completedTasks.includes(updateProgressDto.taskId)
        ) {
          participant.completedTasks.push(updateProgressDto.taskId);
          participant.totalPoints += task.points;
        } else if (
          updateProgressDto.status !== 'completed' &&
          participant.completedTasks.includes(updateProgressDto.taskId)
        ) {
          participant.completedTasks = participant.completedTasks.filter(
            (id) => id !== updateProgressDto.taskId,
          );
          participant.totalPoints = Math.max(
            0,
            participant.totalPoints - task.points,
          );
        }

        // Calculer le progrès en pourcentage (uniquement pour les tâches qui existent encore)
        const validCompletedTasks = participant.completedTasks.filter(taskId =>
          challenge.tasks?.some(t => t.id === taskId)
        );

        participant.progress = Math.round(
          (validCompletedTasks.length / (challenge.tasks?.length || 1)) *
          100,
        );
        participant.lastActivityAt = new Date();
      }

      await challenge.save();

      console.log('   ✅ Progrès mis à jour avec succès');

      const community = await this.communityModel.findOne({
        id: challenge.communityId,
      });
      return this.transformToResponseDto(challenge, community || undefined);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      console.error('❌ Erreur lors de la mise à jour du progrès:', error);
      throw new BadRequestException('Erreur lors de la mise à jour du progrès');
    }
  }

  /**
   * Obtenir le classement d'un défi
   * @param challengeId ID du défi
   * @param limit Nombre d'entrées à retourner
   * @returns Classement des participants
   */
  async getChallengeLeaderboard(challengeId: string, limit: number = 500) {
    console.log('🏅 DEBUG - getChallengeLeaderboard');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   📊 Limit: ${limit}`);

    try {
      // 1. Récupérer le défi
      const challenge = await this.findChallengeById(challengeId);

      if (!challenge) {
        console.error(`   ❌ Challenge not found with ID: ${challengeId}`);
        console.error(`   🔍 Tried MongoDB _id lookup: ${Types.ObjectId.isValid(challengeId)}`);
        throw new NotFoundException('Défi non trouvé');
      }

      console.log(`   ✅ Challenge found: ${challenge.title}`);
      console.log(`   👥 Total participants: ${challenge.participants?.length || 0}`);
      console.log(`   ✅ Active participants: ${challenge.participants?.filter(p => p.isActive).length || 0}`);

      // 2. Handle case with no participants
      if (!challenge.participants || challenge.participants.length === 0) {
        console.log(`   ⚠️ No participants in challenge`);
        return {
          success: true,
          data: {
            leaderboard: [],
            totalParticipants: 0,
            activeParticipants: 0,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
          }
        };
      }

      // 3. Trier les participants par points et progression
      const sortedParticipants = [...challenge.participants]
        .filter(p => p.isActive)
        .sort((a, b) => {
          // Trier d'abord par points totaux (décroissant)
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          // Puis par progression (décroissant)
          if (b.progress !== a.progress) {
            return b.progress - a.progress;
          }
          // Puis par date d'inscription (croissant - premier inscrit en premier)
          return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        })
        .slice(0, limit);

      console.log(`   📊 Sorted ${sortedParticipants.length} active participants`);

      // 4. Récupérer les informations des utilisateurs
      const userIds = sortedParticipants.map(p => p.userId);
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('name email profile_picture photo_profil avatar')
        .lean();

      console.log(`   👤 Found ${users.length} user records`);

      // 5. Construire le classement
      const leaderboard = sortedParticipants.map((participant, index) => {
        const user = users.find(u => u._id.toString() === participant.userId.toString());

        return {
          rank: index + 1,
          userId: participant.userId.toString(),
          userName: user?.name || 'Utilisateur inconnu',
          userAvatar: this.uploadService.ensureAbsoluteUrl(user?.profile_picture || user?.photo_profil) || null,
          totalPoints: participant.totalPoints || 0,
          completedTasks: participant.completedTasks?.length || 0,
          progress: participant.progress || 0,
          joinedAt: participant.joinedAt,
          lastActivityAt: participant.lastActivityAt,
        };
      });

      console.log(`   ✅ Classement généré avec ${leaderboard.length} participants`);
      if (leaderboard.length > 0) {
        console.log(`   📊 Top 3:`, leaderboard.slice(0, 3).map(p => `${p.rank}. ${p.userName} (${p.totalPoints}pts)`));
      }

      return {
        success: true,
        data: {
          leaderboard,
          totalParticipants: challenge.participants.length,
          activeParticipants: challenge.participants.filter(p => p.isActive).length,
          challengeId: challenge.id,
          challengeTitle: challenge.title,
        }
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('❌ Erreur lors de la récupération du classement:', error);
      throw new BadRequestException(
        'Erreur lors de la récupération du classement',
      );
    }
  }

  /**
   * Obtenir les analytics détaillées d'un défi
   * @param challengeId ID du défi
   * @param userId ID de l'utilisateur (pour vérifier les permissions)
   * @param fromDate Date de début
   * @param toDate Date de fin
   * @returns Analytics complètes du défi
   */
  async getChallengeAnalytics(
    challengeId: string,
    userId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    console.log('🔧 DEBUG - getChallengeAnalytics');
    console.log(`   📋 Challenge ID: ${challengeId}`);
    console.log(`   👤 User ID: ${userId}`);
    console.log(`   📅 From: ${fromDate.toISOString()}`);
    console.log(`   📅 To: ${toDate.toISOString()}`);

    try {
      // 1. Récupérer le défi
      const challenge = await this.findChallengeById(challengeId);
      if (!challenge) {
        throw new NotFoundException('Défi non trouvé');
      }

      // 2. Vérifier que l'utilisateur est le créateur du défi
      // Handle both ObjectId and string comparison
      const creatorIdStr = challenge.creatorId?.toString() || '';
      const userIdStr = userId?.toString() || '';

      console.log(`   🔍 Creator ID (from challenge): ${creatorIdStr}`);
      console.log(`   🔍 User ID (from request): ${userIdStr}`);
      console.log(`   🔍 Match: ${creatorIdStr === userIdStr}`);

      if (creatorIdStr !== userIdStr) {
        throw new ForbiddenException(
          'Seul le créateur du défi peut accéder aux analytics',
        );
      }

      const participants = challenge.participants || [];
      const tasks = challenge.tasks || [];
      const posts = challenge.posts || [];

      // ============ OVERVIEW STATS ============
      const totalParticipants = participants.length;
      const activeParticipants = participants.filter(p => p.isActive).length;
      const completedParticipants = participants.filter(p => p.progress === 100).length;
      const completionRate = totalParticipants > 0
        ? Math.round((completedParticipants / totalParticipants) * 100)
        : 0;
      const averageProgress = totalParticipants > 0
        ? Math.round(participants.reduce((acc, p) => acc + (p.progress || 0), 0) / totalParticipants)
        : 0;

      // Calculate total completed tasks across all participants
      const completedTasksTotal = participants.reduce(
        (acc, p) => acc + (p.completedTasks?.length || 0),
        0
      );

      // Calculate total points earned
      const totalPointsEarned = participants.reduce(
        (acc, p) => acc + (p.totalPoints || 0),
        0
      );

      // Revenue calculation
      const participationFee = challenge.pricing?.participationFee || 0;
      const depositAmount = challenge.pricing?.depositAmount || 0;
      const totalRevenue = (participationFee * totalParticipants) + (depositAmount * totalParticipants);

      // ============ PARTICIPANT STATS ============
      // By status
      const participantsByStatus = {
        active: activeParticipants,
        inactive: totalParticipants - activeParticipants,
        completed: completedParticipants,
      };

      // By progress ranges
      const participantsByProgress = {
        notStarted: participants.filter(p => p.progress === 0).length,
        early: participants.filter(p => p.progress > 0 && p.progress <= 25).length,
        midway: participants.filter(p => p.progress > 25 && p.progress <= 50).length,
        advanced: participants.filter(p => p.progress > 50 && p.progress < 100).length,
        completed: completedParticipants,
      };

      // Join trend (group by date)
      const joinTrendMap = new Map<string, number>();
      participants.forEach(p => {
        const joinDate = new Date(p.joinedAt).toISOString().split('T')[0];
        joinTrendMap.set(joinDate, (joinTrendMap.get(joinDate) || 0) + 1);
      });
      const joinTrend = Array.from(joinTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top performers
      const topPerformers = [...participants]
        .sort((a, b) => {
          // Sort by progress first, then by points
          if (b.progress !== a.progress) return b.progress - a.progress;
          return b.totalPoints - a.totalPoints;
        })
        .slice(0, 10)
        .map(p => ({
          odId: p.userId.toString(),
          odName: p.id, // Will be populated with user info if available
          progress: p.progress,
          totalPoints: p.totalPoints,
          completedTasks: p.completedTasks?.length || 0,
          joinedAt: p.joinedAt,
          lastActivityAt: p.lastActivityAt,
        }));

      // ============ TASK STATS ============
      // Completion rate by task
      const taskCompletionStats = tasks.map(task => {
        const completedCount = participants.filter(
          p => p.completedTasks?.includes(task.id)
        ).length;
        const completionRate = totalParticipants > 0
          ? Math.round((completedCount / totalParticipants) * 100)
          : 0;
        return {
          taskId: task.id,
          day: task.day,
          title: task.title,
          points: task.points,
          completedCount,
          completionRate,
        };
      }).sort((a, b) => a.day - b.day);

      // Most difficult tasks (lowest completion rate)
      const mostDifficultTasks = [...taskCompletionStats]
        .sort((a, b) => a.completionRate - b.completionRate)
        .slice(0, 5);

      // Easiest tasks (highest completion rate)
      const easiestTasks = [...taskCompletionStats]
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 5);

      // Task completion funnel (drop-off analysis)
      const taskFunnel = taskCompletionStats.map((task, index) => {
        const previousTask = index > 0 ? taskCompletionStats[index - 1] : null;
        const dropOffRate = previousTask && previousTask.completedCount > 0
          ? Math.round(((previousTask.completedCount - task.completedCount) / previousTask.completedCount) * 100)
          : 0;
        return {
          ...task,
          dropOffRate,
          dropOffCount: previousTask ? previousTask.completedCount - task.completedCount : 0,
        };
      });

      // ============ ENGAGEMENT STATS ============
      const totalPosts = posts.length;
      const totalComments = posts.reduce((acc, p) => acc + (p.comments?.length || 0), 0);
      const totalLikes = posts.reduce((acc, p) => acc + (p.likes || 0), 0);

      // Posts trend
      const postsTrendMap = new Map<string, number>();
      posts.forEach(p => {
        const postDate = new Date(p.createdAt).toISOString().split('T')[0];
        postsTrendMap.set(postDate, (postsTrendMap.get(postDate) || 0) + 1);
      });
      const postsTrend = Array.from(postsTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Activity trend (last activity by participants)
      const activityTrendMap = new Map<string, number>();
      participants.forEach(p => {
        const activityDate = new Date(p.lastActivityAt).toISOString().split('T')[0];
        activityTrendMap.set(activityDate, (activityTrendMap.get(activityDate) || 0) + 1);
      });
      const activityTrend = Array.from(activityTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // ============ REVENUE STATS ============
      const revenueStats = {
        totalRevenue,
        participationFees: participationFee * totalParticipants,
        deposits: depositAmount * totalParticipants,
        averageRevenuePerParticipant: totalParticipants > 0
          ? Math.round(totalRevenue / totalParticipants)
          : 0,
        currency: challenge.pricing?.currency || 'TND',
        isPremium: challenge.pricing?.isPremium || false,
      };

      // ============ TIME STATS ============
      const now = new Date();
      const startDate = new Date(challenge.startDate);
      const endDate = new Date(challenge.endDate);
      const totalDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysElapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const progressPercentage = totalDuration > 0 ? Math.min(100, Math.round((daysElapsed / totalDuration) * 100)) : 0;

      // ============ TRACKING STATS (from content tracking service) ============
      let trackingStats = {
        views: 0,
        starts: 0,
        completes: 0,
        likes: 0,
        shares: 0,
        bookmarks: 0,
      };

      try {
        const stats = await this.trackingService.getContentStats(
          challengeId,
          TrackableContentType.CHALLENGE,
        );
        if (stats) {
          trackingStats = {
            views: stats.views || 0,
            starts: stats.starts || 0,
            completes: stats.completes || 0,
            likes: stats.likes || 0,
            shares: stats.shares || 0,
            bookmarks: stats.bookmarks || 0,
          };
        }
      } catch (e) {
        console.log('   ⚠️ Could not fetch tracking stats:', e);
      }

      console.log('   ✅ Analytics calculées avec succès');

      return {
        success: true,
        data: {
          overview: {
            totalParticipants,
            activeParticipants,
            completedParticipants,
            completionRate,
            averageProgress,
            totalTasks: tasks.length,
            completedTasksTotal,
            totalPointsEarned,
            totalRevenue,
          },
          participantStats: {
            byStatus: participantsByStatus,
            byProgress: participantsByProgress,
            joinTrend,
            topPerformers,
          },
          taskStats: {
            completionByTask: taskCompletionStats,
            taskFunnel,
            mostDifficultTasks,
            easiestTasks,
            totalTasks: tasks.length,
            averageCompletionRate: taskCompletionStats.length > 0
              ? Math.round(taskCompletionStats.reduce((acc, t) => acc + t.completionRate, 0) / taskCompletionStats.length)
              : 0,
          },
          engagementStats: {
            totalPosts,
            totalComments,
            totalLikes,
            postsTrend,
            activityTrend,
            averagePostsPerParticipant: totalParticipants > 0
              ? Math.round((totalPosts / totalParticipants) * 10) / 10
              : 0,
            ...trackingStats,
          },
          revenueStats,
          timeStats: {
            startDate: challenge.startDate,
            endDate: challenge.endDate,
            totalDuration,
            daysElapsed,
            daysRemaining,
            progressPercentage,
            isActive: challenge.isActive,
            isOngoing: challenge.isActive && now >= startDate && now <= endDate,
            isCompleted: now > endDate,
          },
          challenge: {
            id: challenge.id,
            title: challenge.title,
            category: challenge.category,
            difficulty: challenge.difficulty,
            thumbnail: challenge.thumbnail,
          },
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      console.error('❌ Erreur lors de la récupération des analytics:', error);
      throw new BadRequestException(
        'Erreur lors de la récupération des analytics',
      );
    }
  }
}

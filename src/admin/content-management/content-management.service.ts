import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cours, CoursDocument } from '../../schema/course.schema';
import { Challenge, ChallengeDocument } from '../../schema/challenge.schema';
import { ChallengeSubmission, ChallengeSubmissionDocument } from '../../schema/challenge-submission.schema';
import { Event, EventDocument } from '../../schema/event.schema';
import { Post, PostDocument } from '../../schema/post.schema';
import { Community, CommunityDocument } from '../../schema/community.schema';
import { User, UserDocument } from '../../schema/user.schema';
import { CourseEnrollment, CourseEnrollmentDocument } from '../../schema/course.schema';
import { AuditLogService } from '../common/services/audit-log.service';
import { AdminAction } from '../schemas/audit-log.schema';
import {
  ContentFiltersDto,
  CourseFiltersDto,
  ChallengeFiltersDto,
  EventFiltersDto,
  PostFiltersDto,
  PaginationDto,
  SubmissionFiltersDto,
} from './dto/content-filters.dto';
import {
  RejectContentDto,
  SuspendContentDto,
  BulkContentActionDto,
  ApproveSubmissionDto,
  RejectSubmissionDto,
  MessageAttendeesDto,
} from './dto/content-approval.dto';
import {
  CourseResponseDto,
  CourseDetailDto,
  ChallengeResponseDto,
  ChallengeDetailDto,
  ChallengeSubmissionDto,
  EventResponseDto,
  EventDetailDto,
  EventAttendeeDto,
  PostResponseDto,
  PostDetailDto,
  PaginatedResult,
  BulkOperationResult,
  UserSummaryDto,
  CommunitySummaryDto,
} from './dto/content-response.dto';
import { ContentStatus } from './enums/content-status.enum';

@Injectable()
export class ContentManagementService {
  constructor(
    @InjectModel(Cours.name) private courseModel: Model<CoursDocument>,
    @InjectModel(Challenge.name) private challengeModel: Model<ChallengeDocument>,
    @InjectModel(ChallengeSubmission.name) private submissionModel: Model<ChallengeSubmissionDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Community.name) private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CourseEnrollment.name) private enrollmentModel: Model<CourseEnrollmentDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ==================== HELPER METHODS ====================

  private async getUserSummary(userId: Types.ObjectId): Promise<UserSummaryDto> {
    const user = await this.userModel.findById(userId).select('id name email avatar').lean();
    if (!user) {
      return { id: userId.toString(), name: 'Unknown User', email: '' };
    }
    return {
      id: user._id.toString(),
      name: user.name || 'Unknown',
      email: user.email || '',
      avatar: (user as any).avatar,
    };
  }

  private async getCommunitySummary(communityId: string): Promise<CommunitySummaryDto> {
    const community = await this.communityModel.findOne({ id: communityId }).select('name slug').lean();
    if (!community) {
      return { id: communityId, name: 'Unknown Community', slug: '' };
    }
    return {
      id: communityId,
      name: community.name || 'Unknown',
      slug: community.slug || '',
    };
  }

  private async logAction(
    action: AdminAction,
    entityType: string,
    entityId: string,
    adminUserId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.auditLogService.logAction({
      action,
      entityType,
      entityId: new Types.ObjectId(entityId),
      adminUserId: new Types.ObjectId(adminUserId),
      ipAddress: '127.0.0.1',
      userAgent: 'admin-panel',
      metadata,
    } as any);
  }

  // ==================== COURSES ====================

  async getCourses(
    filters: CourseFiltersDto,
    adminUserId: string,
  ): Promise<PaginatedResult<CourseResponseDto>> {
    const query: any = {};

    if (filters.searchTerm) {
      query.$or = [
        { titre: { $regex: filters.searchTerm, $options: 'i' } },
        { description: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    if (filters.status) {
      query.approvalStatus = filters.status;
    }

    if (filters.communityId) {
      query.communityId = filters.communityId;
    }

    if (filters.creatorId) {
      query.creatorId = new Types.ObjectId(filters.creatorId);
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.$and = query.$and || [];
      if (filters.minPrice !== undefined) {
        query.$and.push({ prix: { $gte: filters.minPrice } });
      }
      if (filters.maxPrice !== undefined) {
        query.$and.push({ prix: { $lte: filters.maxPrice } });
      }
    }

    if (filters.category) {
      query.category = { $regex: filters.category, $options: 'i' };
    }

    if (filters.level) {
      query.niveau = filters.level;
    }

    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) {
        query.createdAt.$gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        query.createdAt.$lte = filters.createdBefore;
      }
    }

    if (filters.isFeatured !== undefined) {
      query.isFeatured = filters.isFeatured;
    }

    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseModel
        .find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.courseModel.countDocuments(query),
    ]);

    const data = await Promise.all(
      courses.map(async (course) => this.mapCourseToResponse(course)),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  private async mapCourseToResponse(course: any): Promise<CourseResponseDto> {
    const [creator, community] = await Promise.all([
      this.getUserSummary(course.creatorId),
      this.getCommunitySummary(course.communityId),
    ]);

    const enrollmentCount = await this.enrollmentModel.countDocuments({ courseId: course._id });

    return {
      id: course.id || course._id.toString(),
      title: course.titre,
      description: course.description,
      thumbnail: course.thumbnail,
      status: course.approvalStatus || ContentStatus.APPROVED,
      creator,
      community,
      price: course.prix || 0,
      currency: course.devise || 'TND',
      isPaidCourse: course.isPaidCourse || course.prix > 0,
      enrollmentCount,
      sectionCount: course.sections?.length || 0,
      chapterCount: course.sections?.reduce((total: number, section: any) => total + (section.chapitres?.length || 0), 0),
      isPublished: course.isPublished,
      category: course.category,
      level: course.niveau,
      sequentialProgression: course.sequentialProgression,
      averageRating: course.averageRating || 0,
      ratingCount: course.ratingCount || 0,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      isFeatured: course.isFeatured || false,
    };
  }

  async getCourseById(courseId: string): Promise<CourseDetailDto> {
    const course = await this.courseModel.findOne({ id: courseId }).lean();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const baseResponse = await this.mapCourseToResponse(course);

    return {
      ...baseResponse,
      sections: course.sections?.map((section: any) => ({
        id: section.id,
        title: section.titre,
        description: section.description,
        order: section.ordre,
        chapters: section.chapitres?.map((chapter: any) => ({
          id: chapter.id,
          title: chapter.titre,
          content: chapter.contenu,
          videoUrl: chapter.videoUrl,
          duration: chapter.duree,
          order: chapter.ordre,
          isPreview: chapter.isPreview,
          isPaidChapter: chapter.isPaidChapter,
          prix: chapter.prix,
          notes: chapter.notes,
        })) || [],
      })) || [],
      resources: course.ressources?.map((resource: any) => ({
        id: resource.id,
        title: resource.titre,
        type: resource.type,
        url: resource.url,
        description: resource.description,
        order: resource.ordre,
      })) || [],
      learningObjectives: course.learningObjectives,
      requirements: course.requirements,
      notes: course.notes,
    };
  }

  async approveCourse(courseId: string, adminUserId: string): Promise<void> {
    const course = await this.courseModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    course.isPublished = true;
    (course as any).approvalStatus = ContentStatus.APPROVED;
    await course.save();

    await this.logAction(AdminAction.CONTENT_APPROVE, 'course', courseId, adminUserId);
  }

  async rejectCourse(courseId: string, dto: RejectContentDto, adminUserId: string): Promise<void> {
    const course = await this.courseModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    (course as any).approvalStatus = ContentStatus.REJECTED;
    (course as any).rejectionReason = dto.reason;
    (course as any).rejectionNotes = dto.notes;
    await course.save();

    await this.logAction(AdminAction.CONTENT_REJECT, 'course', courseId, adminUserId, { reason: dto.reason });
  }

  async featureCourse(courseId: string, featured: boolean, adminUserId: string): Promise<void> {
    const course = await this.courseModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    (course as any).isFeatured = featured;
    await course.save();

    await this.logAction(
      featured ? AdminAction.CONTENT_FEATURE : AdminAction.CONTENT_UNFEATURE,
      'course',
      courseId,
      adminUserId,
    );
  }

  async suspendCourse(courseId: string, dto: SuspendContentDto, adminUserId: string): Promise<void> {
    const course = await this.courseModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    course.isPublished = false;
    (course as any).approvalStatus = ContentStatus.SUSPENDED;
    (course as any).suspensionReason = dto.reason;
    await course.save();

    await this.logAction(AdminAction.CONTENT_SUSPEND, 'course', courseId, adminUserId, { reason: dto.reason });
  }

  async getCourseEnrollments(
    courseId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    const course = await this.courseModel.findOne({ id: courseId });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const [enrollments, total] = await Promise.all([
      this.enrollmentModel
        .find({ courseId: course._id })
        .populate('userId', 'name email avatar')
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.enrollmentModel.countDocuments({ courseId: course._id }),
    ]);

    return {
      data: enrollments.map((e: any) => ({
        id: e.id,
        user: {
          id: e.userId?._id?.toString() || e.userId?.toString(),
          name: e.userId?.name || 'Unknown',
          email: e.userId?.email || '',
          avatar: e.userId?.avatar,
        },
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
        isActive: e.isActive,
        progress: e.progression?.length
          ? (e.progression.filter((p: any) => p.isCompleted).length / e.progression.length) * 100
          : 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  async bulkApproveCourses(dto: BulkContentActionDto, adminUserId: string): Promise<BulkOperationResult> {
    const results = await Promise.allSettled(
      dto.ids.map(async (id) => {
        await this.approveCourse(id, adminUserId);
        return id;
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    const errors = results
      .map((r, i) => ({ r, id: dto.ids[i] }))
      .filter(({ r }) => r.status === 'rejected')
      .map(({ r, id }) => ({ id, error: (r as PromiseRejectedResult).reason.message }));

    return {
      success: failed === 0,
      processed: dto.ids.length,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==================== CHALLENGES ====================

  async getChallenges(
    filters: ChallengeFiltersDto,
    adminUserId: string,
  ): Promise<PaginatedResult<ChallengeResponseDto>> {
    const query: any = {};

    if (filters.searchTerm) {
      query.$or = [
        { title: { $regex: filters.searchTerm, $options: 'i' } },
        { description: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    if (filters.status) {
      query.approvalStatus = filters.status;
    }

    if (filters.communityId) {
      query.communityId = filters.communityId;
    }

    if (filters.creatorId) {
      query.creatorId = new Types.ObjectId(filters.creatorId);
    }

    if (filters.startDateAfter || filters.startDateBefore) {
      query.startDate = {};
      if (filters.startDateAfter) {
        query.startDate.$gte = filters.startDateAfter;
      }
      if (filters.startDateBefore) {
        query.startDate.$lte = filters.startDateBefore;
      }
    }

    if (filters.isFeatured !== undefined) {
      query.isFeatured = filters.isFeatured;
    }

    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [challenges, total] = await Promise.all([
      this.challengeModel
        .find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.challengeModel.countDocuments(query),
    ]);

    const data = await Promise.all(
      challenges.map(async (challenge) => this.mapChallengeToResponse(challenge)),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  private async mapChallengeToResponse(challenge: any): Promise<ChallengeResponseDto> {
    const [creator, community] = await Promise.all([
      this.getUserSummary(challenge.creatorId),
      this.getCommunitySummary(challenge.communityId),
    ]);

    const now = new Date();
    let challengeStatus: 'upcoming' | 'active' | 'ended' = 'upcoming';
    if (now >= new Date(challenge.endDate)) {
      challengeStatus = 'ended';
    } else if (now >= new Date(challenge.startDate)) {
      challengeStatus = 'active';
    }

    const participantCount = await this.submissionModel.countDocuments({
      challengeId: challenge._id,
    });

    const submissionCount = await this.submissionModel.countDocuments({
      challengeId: challenge._id,
      status: { $in: ['submitted', 'approved'] },
    });

    return {
      id: challenge._id.toString(),
      title: challenge.title,
      description: challenge.description,
      coverImage: challenge.coverImage,
      status: challenge.approvalStatus || ContentStatus.APPROVED,
      creator,
      community,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      participantCount,
      submissionCount,
      prizeInfo: challenge.prizeInfo,
      challengeStatus,
      difficulty: challenge.difficulty || 'beginner',
      maxParticipants: challenge.maxParticipants,
      isTeamChallenge: challenge.isTeamChallenge || false,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt,
      isFeatured: challenge.isFeatured || false,
    };
  }

  async getChallengeById(challengeId: string): Promise<ChallengeDetailDto> {
    const challenge = await this.challengeModel.findById(challengeId).lean();
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const baseResponse = await this.mapChallengeToResponse(challenge);

    return {
      ...baseResponse,
      rules: (challenge as any).rules,
      evaluationCriteria: (challenge as any).evaluationCriteria,
      tasks: challenge.tasks?.map((task: any) => ({
        id: task.id,
        day: task.day,
        title: task.title,
        description: task.description,
        deliverable: task.deliverable,
        points: task.points,
        isActive: task.isActive,
      })) || [],
      resources: challenge.resources?.map((resource: any) => ({
        id: resource.id,
        title: resource.title,
        type: resource.type,
        url: resource.url,
      })) || [],
      prizes: (challenge as any).prizes,
      hashtags: (challenge as any).hashtags,
    };
  }

  async getChallengeSubmissions(
    challengeId: string,
    filters: SubmissionFiltersDto,
  ): Promise<PaginatedResult<ChallengeSubmissionDto>> {
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const query: any = { challengeId: new Types.ObjectId(challengeId) };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      this.submissionModel
        .find(query)
        .populate('userId', 'name email avatar')
        .populate('reviewedBy', 'name email')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.submissionModel.countDocuments(query),
    ]);

    const data = await Promise.all(
      submissions.map(async (sub: any) => ({
        id: sub._id.toString(),
        challengeId: sub.challengeId.toString(),
        user: {
          id: sub.userId?._id?.toString() || sub.userId?.toString(),
          name: sub.userId?.name || 'Unknown',
          email: sub.userId?.email || '',
          avatar: sub.userId?.avatar,
        },
        content: sub.content,
        attachments: sub.attachments,
        status: sub.status,
        submittedAt: sub.submittedAt,
        reviewedAt: sub.reviewedAt,
        reviewedBy: sub.reviewedBy
          ? {
              id: sub.reviewedBy._id?.toString(),
              name: sub.reviewedBy.name || 'Unknown',
              email: sub.reviewedBy.email || '',
            }
          : undefined,
        feedback: sub.feedback,
        isWinner: sub.isWinner || false,
        points: sub.points || 0,
      })),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  async approveChallenge(challengeId: string, adminUserId: string): Promise<void> {
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    (challenge as any).approvalStatus = ContentStatus.APPROVED;
    await challenge.save();

    await this.logAction(AdminAction.CONTENT_APPROVE, 'challenge', challengeId, adminUserId);
  }

  async rejectChallenge(challengeId: string, dto: RejectContentDto, adminUserId: string): Promise<void> {
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    (challenge as any).approvalStatus = ContentStatus.REJECTED;
    (challenge as any).rejectionReason = dto.reason;
    await challenge.save();

    await this.logAction(AdminAction.CONTENT_REJECT, 'challenge', challengeId, adminUserId, { reason: dto.reason });
  }

  async endChallengeEarly(challengeId: string, adminUserId: string): Promise<void> {
    const challenge = await this.challengeModel.findById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    challenge.endDate = new Date();
    await challenge.save();

    await this.logAction(AdminAction.CONTENT_UPDATE as any, 'challenge', challengeId, adminUserId, { action: 'ended_early' });
  }

  async approveSubmission(submissionId: string, dto: ApproveSubmissionDto, adminUserId: string): Promise<void> {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    submission.status = 'approved';
    submission.reviewedAt = new Date();
    submission.reviewedBy = new Types.ObjectId(adminUserId);
    submission.feedback = dto.feedback;
    (submission as any).isWinner = dto.markAsWinner || false;
    await submission.save();

    await this.logAction(AdminAction.CONTENT_APPROVE, 'challenge_submission', submissionId, adminUserId);
  }

  async rejectSubmission(submissionId: string, dto: RejectSubmissionDto, adminUserId: string): Promise<void> {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    submission.status = 'rejected';
    submission.reviewedAt = new Date();
    submission.reviewedBy = new Types.ObjectId(adminUserId);
    submission.feedback = dto.feedback || dto.reason;
    await submission.save();

    await this.logAction(AdminAction.CONTENT_REJECT, 'challenge_submission', submissionId, adminUserId, {
      reason: dto.reason,
    });
  }

  // ==================== EVENTS ====================

  async getEvents(
    filters: EventFiltersDto,
    adminUserId: string,
  ): Promise<PaginatedResult<EventResponseDto>> {
    const query: any = {};

    if (filters.searchTerm) {
      query.$or = [
        { title: { $regex: filters.searchTerm, $options: 'i' } },
        { description: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    if (filters.status) {
      query.approvalStatus = filters.status;
    }

    if (filters.communityId) {
      query.communityId = filters.communityId;
    }

    if (filters.creatorId) {
      query.creatorId = new Types.ObjectId(filters.creatorId);
    }

    if (filters.startDateAfter || filters.startDateBefore) {
      query.startDate = {};
      if (filters.startDateAfter) {
        query.startDate.$gte = filters.startDateAfter;
      }
      if (filters.startDateBefore) {
        query.startDate.$lte = filters.startDateBefore;
      }
    }

    if (filters.location) {
      query.location = { $regex: filters.location, $options: 'i' };
    }

    if (filters.isFeatured !== undefined) {
      query.isFeatured = filters.isFeatured;
    }

    const sortField = filters.sortBy || 'startDate';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.eventModel
        .find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.eventModel.countDocuments(query),
    ]);

    const data = await Promise.all(
      events.map(async (event) => this.mapEventToResponse(event)),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  private async mapEventToResponse(event: any): Promise<EventResponseDto> {
    const [creator, community] = await Promise.all([
      this.getUserSummary(event.creatorId),
      this.getCommunitySummary(event.communityId),
    ]);

    const now = new Date();
    let eventStatus: 'upcoming' | 'ongoing' | 'ended' | 'cancelled' = 'upcoming';
    if (event.isCancelled) {
      eventStatus = 'cancelled';
    } else if (now >= new Date(event.endDate)) {
      eventStatus = 'ended';
    } else if (now >= new Date(event.startDate)) {
      eventStatus = 'ongoing';
    }

    const attendeeCount = event.attendees?.filter((a: any) => a.status !== 'cancelled').length || 0;

    return {
      id: event._id.toString(),
      title: event.title,
      description: event.description,
      coverImage: event.coverImage,
      status: event.approvalStatus || ContentStatus.APPROVED,
      creator,
      community,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location || 'Online',
      isOnline: event.isOnline || false,
      onlineLink: event.onlineLink,
      attendeeCount,
      maxAttendees: event.maxAttendees,
      eventStatus,
      ticketTypes: event.ticketTypes?.map((t: any) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        price: t.price,
        quantity: t.quantity,
        sold: t.sold || 0,
      })) || [],
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      isFeatured: event.isFeatured || false,
    };
  }

  async getEventById(eventId: string): Promise<EventDetailDto> {
    const event = await this.eventModel.findById(eventId).lean();
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const baseResponse = await this.mapEventToResponse(event);

    return {
      ...baseResponse,
      agenda: (event as any).agenda?.map((item: any) => ({
        id: item.id,
        startTime: item.startTime,
        endTime: item.endTime,
        title: item.title,
        description: item.description,
        speaker: item.speaker,
      })) || [],
      speakers: event.speakers?.map((s: any) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        bio: s.bio,
        avatar: s.avatar,
      })) || [],
      requirements: (event as any).requirements,
      whatToBring: (event as any).whatToBring,
      isPrivate: (event as any).isPrivate || false,
      approvalRequired: (event as any).approvalRequired || false,
    };
  }

  async getEventAttendees(
    eventId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<EventAttendeeDto>> {
    const event = await this.eventModel.findById(eventId).lean();
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const page = pagination.page || 1;
    const limit = pagination.limit || 20;

    const attendees = event.attendees || [];
    const filteredAttendees = attendees.filter((a: any) => a.status !== 'cancelled');

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAttendees = filteredAttendees.slice(startIndex, endIndex);

    const data = await Promise.all(
      paginatedAttendees.map(async (attendee: any) => {
        const user = await this.userModel.findById(attendee.userId).select('name email avatar').lean();
        return {
          id: attendee._id?.toString() || attendee.userId?.toString(),
          user: {
            id: user?._id?.toString() || attendee.userId?.toString(),
            name: user?.name || 'Unknown',
            email: user?.email || '',
            avatar: (user as any)?.avatar,
          },
          ticketType: attendee.ticketType,
          registeredAt: attendee.registeredAt,
          checkedIn: attendee.checkedIn || false,
          checkedInAt: attendee.checkedInAt,
          status: attendee.status,
        };
      }),
    );

    const total = filteredAttendees.length;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: endIndex < total,
      hasPrevPage: page > 1,
    };
  }

  async approveEvent(eventId: string, adminUserId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    (event as any).approvalStatus = ContentStatus.APPROVED;
    await event.save();

    await this.logAction(AdminAction.CONTENT_APPROVE, 'event', eventId, adminUserId);
  }

  async rejectEvent(eventId: string, dto: RejectContentDto, adminUserId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    (event as any).approvalStatus = ContentStatus.REJECTED;
    (event as any).rejectionReason = dto.reason;
    await event.save();

    await this.logAction(AdminAction.CONTENT_REJECT, 'event', eventId, adminUserId, { reason: dto.reason });
  }

  async cancelEvent(eventId: string, reason: string, adminUserId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    (event as any).isCancelled = true;
    (event as any).cancellationReason = reason;
    (event as any).cancelledBy = new Types.ObjectId(adminUserId);
    (event as any).cancelledAt = new Date();
    await event.save();

    await this.logAction(AdminAction.CONTENT_CANCEL as any, 'event', eventId, adminUserId, { reason });
  }

  async messageAttendees(eventId: string, dto: MessageAttendeesDto, adminUserId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // This would typically integrate with a notification service
    // For now, just log the action
    await this.logAction(AdminAction.CONTENT_NOTIFY as any, 'event', eventId, adminUserId, {
      message: dto.message,
      sendEmail: dto.sendEmail,
    });
  }

  // ==================== POSTS ====================

  async getPosts(
    filters: PostFiltersDto,
    adminUserId: string,
  ): Promise<PaginatedResult<PostResponseDto>> {
    const query: any = {};

    if (filters.searchTerm) {
      query.$or = [
        { title: { $regex: filters.searchTerm, $options: 'i' } },
        { content: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    if (filters.status) {
      query.isPublished = filters.status === ContentStatus.APPROVED;
    }

    if (filters.communityId) {
      query.communityId = filters.communityId;
    }

    if (filters.creatorId) {
      query.authorId = new Types.ObjectId(filters.creatorId);
    }

    if (filters.hasComments !== undefined) {
      query.commentCount = filters.hasComments ? { $gt: 0 } : { $eq: 0 };
    }

    if (filters.hasLikes !== undefined) {
      query.likeCount = filters.hasLikes ? { $gt: 0 } : { $eq: 0 };
    }

    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) {
        query.createdAt.$gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        query.createdAt.$lte = filters.createdBefore;
      }
    }

    if (filters.isFeatured !== undefined) {
      query.isFeatured = filters.isFeatured;
    }

    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(query),
    ]);

    const data = await Promise.all(
      posts.map(async (post) => this.mapPostToResponse(post)),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };
  }

  private async mapPostToResponse(post: any): Promise<PostResponseDto> {
    const [author, community] = await Promise.all([
      this.getUserSummary(post.authorId),
      this.getCommunitySummary(post.communityId),
    ]);

    return {
      id: post.id || post._id.toString(),
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || post.content.substring(0, 200) + '...',
      thumbnail: post.thumbnail,
      status: post.isPublished ? ContentStatus.APPROVED : ContentStatus.SUSPENDED,
      author,
      community,
      likeCount: post.likeCount || 0,
      commentCount: post.commentCount || (post.comments?.length || 0),
      isPublished: post.isPublished,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      isFeatured: post.isFeatured || false,
    };
  }

  async getPostById(postId: string): Promise<PostDetailDto> {
    const post = await this.postModel.findOne({ id: postId }).lean();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const baseResponse = await this.mapPostToResponse(post);

    const comments = await Promise.all(
      (post.comments || []).map(async (comment: any) => {
        const user = await this.userModel.findById(comment.userId).select('name email avatar').lean();
        return {
          id: comment.id,
          content: comment.content,
          user: {
            id: user?._id?.toString() || comment.userId?.toString(),
            name: user?.name || 'Unknown',
            email: user?.email || '',
            avatar: (user as any)?.avatar,
          },
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      }),
    );

    return {
      ...baseResponse,
      comments,
    };
  }

  async moderatePost(postId: string, action: 'hide' | 'delete' | 'restore', adminUserId: string): Promise<void> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    switch (action) {
      case 'hide':
        post.isPublished = false;
        await this.logAction(AdminAction.CONTENT_HIDE, 'post', postId, adminUserId);
        break;
      case 'delete':
        await this.postModel.deleteOne({ id: postId });
        await this.logAction(AdminAction.CONTENT_DELETE, 'post', postId, adminUserId);
        return;
      case 'restore':
        post.isPublished = true;
        await this.logAction(AdminAction.CONTENT_RESTORE, 'post', postId, adminUserId);
        break;
    }

    await post.save();
  }

  async featurePost(postId: string, featured: boolean, adminUserId: string): Promise<void> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    (post as any).isFeatured = featured;
    await post.save();

    await this.logAction(
      featured ? AdminAction.CONTENT_FEATURE : AdminAction.CONTENT_UNFEATURE,
      'post',
      postId,
      adminUserId,
    );
  }

  async deletePost(postId: string, adminUserId: string): Promise<void> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.postModel.deleteOne({ id: postId });
    await this.logAction(AdminAction.CONTENT_DELETE, 'post', postId, adminUserId);
  }

  async deleteComment(postId: string, commentId: string, adminUserId: string): Promise<void> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    post.comments = post.comments.filter((c: any) => c.id !== commentId);
    (post as any).commentCount = post.comments.length;
    await post.save();

    await this.logAction(AdminAction.CONTENT_DELETE, 'comment', commentId, adminUserId, { postId });
  }

  // ==================== SUMMARY ====================

  async getContentSummary(adminUserId: string): Promise<{
    courses: { total: number; pending: number; featured: number };
    challenges: { total: number; pending: number; active: number; featured: number };
    events: { total: number; pending: number; upcoming: number; featured: number };
    posts: { total: number; hidden: number; featured: number };
  }> {
    const now = new Date();

    const [
      coursesTotal,
      coursesPending,
      coursesFeatured,
      challengesTotal,
      challengesPending,
      challengesActive,
      challengesFeatured,
      eventsTotal,
      eventsPending,
      eventsUpcoming,
      eventsFeatured,
      postsTotal,
      postsHidden,
      postsFeatured,
    ] = await Promise.all([
      this.courseModel.countDocuments(),
      this.courseModel.countDocuments({ approvalStatus: ContentStatus.PENDING }),
      this.courseModel.countDocuments({ isFeatured: true }),
      this.challengeModel.countDocuments(),
      this.challengeModel.countDocuments({ approvalStatus: ContentStatus.PENDING }),
      this.challengeModel.countDocuments({ startDate: { $lte: now }, endDate: { $gte: now } }),
      this.challengeModel.countDocuments({ isFeatured: true }),
      this.eventModel.countDocuments(),
      this.eventModel.countDocuments({ approvalStatus: ContentStatus.PENDING }),
      this.eventModel.countDocuments({ startDate: { $gte: now }, isCancelled: { $ne: true } }),
      this.eventModel.countDocuments({ isFeatured: true }),
      this.postModel.countDocuments(),
      this.postModel.countDocuments({ isPublished: false }),
      this.postModel.countDocuments({ isFeatured: true }),
    ]);

    return {
      courses: { total: coursesTotal, pending: coursesPending, featured: coursesFeatured },
      challenges: { total: challengesTotal, pending: challengesPending, active: challengesActive, featured: challengesFeatured },
      events: { total: eventsTotal, pending: eventsPending, upcoming: eventsUpcoming, featured: eventsFeatured },
      posts: { total: postsTotal, hidden: postsHidden, featured: postsFeatured },
    };
  }
}

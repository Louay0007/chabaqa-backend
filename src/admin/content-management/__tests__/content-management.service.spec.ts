import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ContentManagementService } from '../content-management.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { AdminAction } from '../../schemas/audit-log.schema';
import { Cours } from '../../../schema/course.schema';
import { Challenge } from '../../../schema/challenge.schema';
import { ChallengeSubmission } from '../../../schema/challenge-submission.schema';
import { Event } from '../../../schema/event.schema';
import { Post } from '../../../schema/post.schema';
import { Community } from '../../../schema/community.schema';
import { User } from '../../../schema/user.schema';
import { CourseEnrollment } from '../../../schema/course.schema';
import { ContentStatus } from '../enums/content-status.enum';

describe('ContentManagementService', () => {
  let service: ContentManagementService;
  let mockCourseModel: any;
  let mockChallengeModel: any;
  let mockSubmissionModel: any;
  let mockEventModel: any;
  let mockPostModel: any;
  let mockCommunityModel: any;
  let mockUserModel: any;
  let mockEnrollmentModel: any;
  let mockAuditLogService: any;

  let testAdminId: string;
  let testCourseId: string;
  let testChallengeId: string;
  let testEventId: string;
  let testPostId: string;
  let testUserId: string;
  let testCommunityId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    testAdminId = new Types.ObjectId().toString();
    testCourseId = new Types.ObjectId().toString();
    testChallengeId = new Types.ObjectId().toString();
    testEventId = new Types.ObjectId().toString();
    testPostId = new Types.ObjectId().toString();
    testUserId = new Types.ObjectId().toString();
    testCommunityId = new Types.ObjectId().toString();

    // Helper to create chainable query mocks
    const createQueryMock = (finalValue: any = null) => {
      const query: any = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(finalValue),
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(finalValue),
      };
      
      // Also make the query object thenable so it can be awaited directly
      query.then = (resolve: any) => Promise.resolve(finalValue).then(resolve);
      
      return jest.fn().mockReturnValue(query);
    };

    // Mock Course Model
    mockCourseModel = {
      find: createQueryMock([]),
      findOne: createQueryMock(null),
      findById: createQueryMock(null),
      countDocuments: jest.fn().mockResolvedValue(0),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    };

    // Mock Challenge Model
    mockChallengeModel = {
      find: createQueryMock([]),
      findById: createQueryMock(null),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    // Mock Submission Model
    mockSubmissionModel = {
      find: createQueryMock([]),
      findById: createQueryMock(null),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    // Mock Event Model
    mockEventModel = {
      find: createQueryMock([]),
      findById: createQueryMock(null),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    // Mock Post Model
    mockPostModel = {
      find: createQueryMock([]),
      findOne: createQueryMock(null),
      countDocuments: jest.fn().mockResolvedValue(0),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    // Mock Community Model
    mockCommunityModel = {
      findOne: createQueryMock(null),
    };

    // Mock User Model
    mockUserModel = {
      findById: createQueryMock(null),
    };

    // Mock Enrollment Model
    mockEnrollmentModel = {
      find: createQueryMock([]),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    // Mock AuditLogService
    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentManagementService,
        {
          provide: getModelToken(Cours.name),
          useValue: mockCourseModel,
        },
        {
          provide: getModelToken(Challenge.name),
          useValue: mockChallengeModel,
        },
        {
          provide: getModelToken(ChallengeSubmission.name),
          useValue: mockSubmissionModel,
        },
        {
          provide: getModelToken(Event.name),
          useValue: mockEventModel,
        },
        {
          provide: getModelToken(Post.name),
          useValue: mockPostModel,
        },
        {
          provide: getModelToken(Community.name),
          useValue: mockCommunityModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: getModelToken(CourseEnrollment.name),
          useValue: mockEnrollmentModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<ContentManagementService>(ContentManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== COURSES TESTS ====================
  describe('getCourses', () => {
    it('should return paginated courses with correct count', async () => {
      const mockCourses = [
        {
          _id: testCourseId,
          id: testCourseId,
          titre: 'Test Course',
          description: 'Test Description',
          creatorId: new Types.ObjectId(testUserId),
          communityId: testCommunityId,
          prix: 99,
          devise: 'USD',
          isPublished: true,
          approvalStatus: ContentStatus.APPROVED,
          isFeatured: true,
          sections: [{ id: 'sec-1', titre: 'Section 1', chapitres: [{ id: 'chap-1', titre: 'Chapter 1' }] }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCourseModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockCourses),
            }),
          }),
        }),
      });

      mockCourseModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });
      mockEnrollmentModel.countDocuments.mockResolvedValue(5);

      const result = await service.getCourses({ page: 1, limit: 20 }, testAdminId);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(false);
      expect(result.data[0].title).toBe('Test Course');
      expect(result.data[0].enrollmentCount).toBe(5);
      expect(result.data[0].sectionCount).toBe(1);
      expect(result.data[0].chapterCount).toBe(1);
    });

    it('should filter courses by status', async () => {
      mockCourseModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      mockCourseModel.countDocuments.mockResolvedValue(0);

      const result = await service.getCourses(
        { page: 1, limit: 20, status: ContentStatus.PENDING },
        testAdminId,
      );

      expect(mockCourseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: ContentStatus.PENDING }),
      );
      expect(result.total).toBe(0);
    });

    it('should filter courses by price range', async () => {
      mockCourseModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      mockCourseModel.countDocuments.mockResolvedValue(0);

      await service.getCourses(
        { page: 1, limit: 20, minPrice: 10, maxPrice: 100 },
        testAdminId,
      );

      expect(mockCourseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            { prix: { $gte: 10 } },
            { prix: { $lte: 100 } },
          ]),
        }),
      );
    });
  });

  describe('approveCourse', () => {
    it('should approve a course and log action', async () => {
      const mockCourse = {
        _id: testCourseId,
        id: testCourseId,
        isPublished: false,
        approvalStatus: ContentStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
      };

      mockCourseModel.findOne.mockResolvedValue(mockCourse);

      await service.approveCourse(testCourseId, testAdminId);

      expect(mockCourse.isPublished).toBe(true);
      expect(mockCourse.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_APPROVE,
          entityType: 'course',
        }),
      );
    });

    it('should throw NotFoundException when course not found', async () => {
      mockCourseModel.findOne.mockResolvedValue(null);

      const invalidId = new Types.ObjectId().toString();
      await expect(service.approveCourse(invalidId, testAdminId)).rejects.toThrow(
        'Course not found',
      );
    });
  });

  describe('featureCourse', () => {
    it('should feature a course', async () => {
      const mockCourse = {
        _id: testCourseId,
        id: testCourseId,
        isFeatured: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockCourseModel.findOne.mockResolvedValue(mockCourse);

      await service.featureCourse(testCourseId, true, testAdminId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_FEATURE,
          entityType: 'course',
        }),
      );
    });

    it('should unfeature a course', async () => {
      const mockCourse = {
        _id: testCourseId,
        id: testCourseId,
        isFeatured: true,
        save: jest.fn().mockResolvedValue(true),
      };

      mockCourseModel.findOne.mockResolvedValue(mockCourse);

      await service.featureCourse(testCourseId, false, testAdminId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_UNFEATURE,
          entityType: 'course',
        }),
      );
    });
  });

  describe('getCourseEnrollments', () => {
    it('should return paginated enrollments', async () => {
      const mockCourse = {
        _id: testCourseId,
        id: testCourseId,
      };

      const mockEnrollments = [
        {
          _id: new Types.ObjectId(),
          id: 'enrollment-1',
          userId: {
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
            avatar: 'avatar.png',
          },
          enrolledAt: new Date(),
          isActive: true,
          progression: [{ isCompleted: true }, { isCompleted: false }],
        },
      ];

      mockCourseModel.findOne.mockResolvedValue(mockCourse);
      mockEnrollmentModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockEnrollments),
              }),
            }),
          }),
        }),
      });
      mockEnrollmentModel.countDocuments.mockResolvedValue(1);

      const result = await service.getCourseEnrollments(testCourseId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].user.name).toBe('Test User');
      expect(result.data[0].progress).toBe(50); // 1 completed out of 2 = 50%
    });
  });

  // ==================== CHALLENGES TESTS ====================
  describe('getChallenges', () => {
    it('should return paginated challenges with correct status', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // tomorrow
      const pastDate = new Date(now.getTime() - 86400000); // yesterday

      const mockChallenges = [
        {
          _id: testChallengeId,
          title: 'Active Challenge',
          description: 'Test Challenge',
          creatorId: new Types.ObjectId(testUserId),
          communityId: testCommunityId,
          startDate: pastDate,
          endDate: futureDate,
          approvalStatus: ContentStatus.APPROVED,
          isFeatured: false,
          difficulty: 'intermediate',
          createdAt: now,
          updatedAt: now,
        },
      ];

      mockChallengeModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockChallenges),
            }),
          }),
        }),
      });
      mockChallengeModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });
      mockSubmissionModel.countDocuments.mockResolvedValue(0);

      const result = await service.getChallenges({ page: 1, limit: 20 }, testAdminId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].challengeStatus).toBe('active');
      expect(result.data[0].difficulty).toBe('intermediate');
    });

    it('should identify upcoming challenges correctly', async () => {
      const futureDate = new Date(Date.now() + 86400000);

      const mockChallenges = [
        {
          _id: testChallengeId,
          title: 'Upcoming Challenge',
          startDate: futureDate,
          endDate: new Date(futureDate.getTime() + 86400000),
          approvalStatus: ContentStatus.APPROVED,
        },
      ];

      mockChallengeModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockChallenges),
            }),
          }),
        }),
      });
      mockChallengeModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });
      mockSubmissionModel.countDocuments.mockResolvedValue(0);

      const result = await service.getChallenges({ page: 1, limit: 20 }, testAdminId);

      expect(result.data[0].challengeStatus).toBe('upcoming');
    });
  });

  describe('approveChallenge', () => {
    it('should approve a challenge', async () => {
      const mockChallenge = {
        _id: testChallengeId,
        approvalStatus: ContentStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
      };

      mockChallengeModel.findById.mockResolvedValue(mockChallenge);

      await service.approveChallenge(testChallengeId, testAdminId);

      expect(mockChallenge.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_APPROVE,
          entityType: 'challenge',
        }),
      );
    });
  });

  describe('endChallengeEarly', () => {
    it('should end challenge early and log action', async () => {
      const mockChallenge = {
        _id: testChallengeId,
        endDate: new Date(Date.now() + 86400000),
        save: jest.fn().mockResolvedValue(true),
      };

      mockChallengeModel.findById.mockResolvedValue(mockChallenge);

      await service.endChallengeEarly(testChallengeId, testAdminId);

      expect(mockChallenge.endDate).toBeInstanceOf(Date);
      expect(mockChallenge.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_UPDATE,
          entityType: 'challenge',
          metadata: expect.objectContaining({ action: 'ended_early' }),
        }),
      );
    });
  });

  // ==================== EVENTS TESTS ====================
  describe('getEvents', () => {
    it('should return paginated events with correct status', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000);

      const mockEvents = [
        {
          _id: testEventId,
          title: 'Upcoming Event',
          description: 'Test Event',
          creatorId: new Types.ObjectId(testUserId),
          communityId: testCommunityId,
          startDate: futureDate,
          endDate: new Date(futureDate.getTime() + 3600000),
          location: 'Online',
          isOnline: true,
          approvalStatus: ContentStatus.APPROVED,
          isFeatured: true,
          attendees: [{ status: 'registered' }, { status: 'registered' }],
          ticketTypes: [{ id: 'ticket-1', type: 'standard', name: 'Standard', price: 0, sold: 2 }],
          createdAt: now,
          updatedAt: now,
        },
      ];

      mockEventModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockEvents),
            }),
          }),
        }),
      });
      mockEventModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });

      const result = await service.getEvents({ page: 1, limit: 20 }, testAdminId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].eventStatus).toBe('upcoming');
      expect(result.data[0].attendeeCount).toBe(2);
      expect(result.data[0].isFeatured).toBe(true);
    });

    it('should identify cancelled events correctly', async () => {
      const mockEvents = [
        {
          _id: testEventId,
          title: 'Cancelled Event',
          isCancelled: true,
          startDate: new Date(),
          endDate: new Date(),
          attendees: [],
          ticketTypes: [],
        },
      ];

      mockEventModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockEvents),
            }),
          }),
        }),
      });
      mockEventModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });

      const result = await service.getEvents({ page: 1, limit: 20 }, testAdminId);

      expect(result.data[0].eventStatus).toBe('cancelled');
    });
  });

  describe('cancelEvent', () => {
    it('should cancel an event with reason', async () => {
      const mockEvent = {
        _id: testEventId,
        isCancelled: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockEventModel.findById.mockResolvedValue(mockEvent);

      await service.cancelEvent(testEventId, 'Weather emergency', testAdminId);

      expect(mockEvent.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_CANCEL,
          entityType: 'event',
          metadata: expect.objectContaining({ reason: 'Weather emergency' }),
        }),
      );
    });
  });

  describe('messageAttendees', () => {
    it('should log messaging action', async () => {
      const mockEvent = {
        _id: testEventId,
        title: 'Test Event',
      };

      mockEventModel.findById.mockResolvedValue(mockEvent);

      await service.messageAttendees(
        testEventId,
        { message: 'Event reminder', sendEmail: true },
        testAdminId,
      );

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_NOTIFY,
          entityType: 'event',
          metadata: expect.objectContaining({
            message: 'Event reminder',
            sendEmail: true,
          }),
        }),
      );
    });
  });

  // ==================== POSTS TESTS ====================
  describe('getPosts', () => {
    it('should return paginated posts', async () => {
      const mockPosts = [
        {
          _id: testPostId,
          id: testPostId,
          title: 'Test Post',
          content: 'Test content here',
          authorId: new Types.ObjectId(testUserId),
          communityId: testCommunityId,
          isPublished: true,
          isFeatured: false,
          likeCount: 10,
          commentCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockPosts),
            }),
          }),
        }),
      });
      mockPostModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });

      const result = await service.getPosts({ page: 1, limit: 20 }, testAdminId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].likeCount).toBe(10);
      expect(result.data[0].commentCount).toBe(5);
      expect(result.data[0].status).toBe(ContentStatus.APPROVED);
    });

    it('should filter posts by status', async () => {
      mockPostModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      mockPostModel.countDocuments.mockResolvedValue(0);

      await service.getPosts(
        { page: 1, limit: 20, status: ContentStatus.APPROVED },
        testAdminId,
      );

      expect(mockPostModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true }),
      );
    });
  });

  describe('moderatePost', () => {
    it('should hide a post', async () => {
      const mockPost = {
        _id: testPostId,
        id: testPostId,
        isPublished: true,
        save: jest.fn().mockResolvedValue(true),
      };

      mockPostModel.findOne.mockResolvedValue(mockPost);

      await service.moderatePost(testPostId, 'hide', testAdminId);

      expect(mockPost.isPublished).toBe(false);
      expect(mockPost.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_HIDE,
          entityType: 'post',
        }),
      );
    });

    it('should delete a post', async () => {
      mockPostModel.findOne.mockResolvedValue({
        _id: testPostId,
        id: testPostId,
      });
      mockPostModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.moderatePost(testPostId, 'delete', testAdminId);

      expect(mockPostModel.deleteOne).toHaveBeenCalledWith({ id: testPostId });
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_DELETE,
          entityType: 'post',
        }),
      );
    });

    it('should restore a post', async () => {
      const mockPost = {
        _id: testPostId,
        id: testPostId,
        isPublished: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockPostModel.findOne.mockResolvedValue(mockPost);

      await service.moderatePost(testPostId, 'restore', testAdminId);

      expect(mockPost.isPublished).toBe(true);
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_RESTORE,
          entityType: 'post',
        }),
      );
    });
  });

  describe('featurePost', () => {
    it('should feature a post', async () => {
      const mockPost = {
        _id: testPostId,
        id: testPostId,
        isFeatured: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockPostModel.findOne.mockResolvedValue(mockPost);

      await service.featurePost(testPostId, true, testAdminId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_FEATURE,
          entityType: 'post',
        }),
      );
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment from a post', async () => {
      const testCommentId = new Types.ObjectId().toString();
      const mockPost = {
        _id: testPostId,
        id: testPostId,
        comments: [
          { id: testCommentId, content: 'Test comment' },
          { id: 'comment-2', content: 'Another comment' },
        ],
        commentCount: 2,
        save: jest.fn().mockResolvedValue(true),
      };

      mockPostModel.findOne.mockResolvedValue(mockPost);

      // Use a valid ObjectId string so logAction(new ObjectId(entityId)) does not throw
      await service.deleteComment(testPostId, testCommentId, testAdminId);

      expect(mockPost.comments).toHaveLength(1);
      expect(mockPost.save).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminAction.CONTENT_DELETE,
          entityType: 'comment',
          metadata: expect.objectContaining({ postId: testPostId }),
        }),
      );
    });
  });

  // ==================== SUMMARY TESTS ====================
  describe('getContentSummary', () => {
    it('should return correct content statistics', async () => {
      // Mock all countDocuments calls
      mockCourseModel.countDocuments
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // pending
        .mockResolvedValueOnce(3); // featured

      mockChallengeModel.countDocuments
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(2) // active
        .mockResolvedValueOnce(1); // featured

      mockEventModel.countDocuments
        .mockResolvedValueOnce(8) // total
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(4) // upcoming
        .mockResolvedValueOnce(2); // featured

      mockPostModel.countDocuments
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(5) // hidden
        .mockResolvedValueOnce(10); // featured

      const result = await service.getContentSummary(testAdminId);

      expect(result.courses.total).toBe(10);
      expect(result.courses.pending).toBe(2);
      expect(result.courses.featured).toBe(3);

      expect(result.challenges.total).toBe(5);
      expect(result.challenges.pending).toBe(1);
      expect(result.challenges.active).toBe(2);
      expect(result.challenges.featured).toBe(1);

      expect(result.events.total).toBe(8);
      expect(result.events.pending).toBe(3);
      expect(result.events.upcoming).toBe(4);
      expect(result.events.featured).toBe(2);

      expect(result.posts.total).toBe(50);
      expect(result.posts.hidden).toBe(5);
      expect(result.posts.featured).toBe(10);
    });
  });

  // ==================== BULK OPERATIONS TESTS ====================
  describe('bulkApproveCourses', () => {
    it('should approve multiple courses successfully', async () => {
      const mockCourse1 = {
        _id: new Types.ObjectId(),
        id: new Types.ObjectId().toString(),
        isPublished: false,
        save: jest.fn().mockResolvedValue(true),
      };
      const mockCourse2 = {
        _id: new Types.ObjectId(),
        id: new Types.ObjectId().toString(),
        isPublished: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockCourseModel.findOne
        .mockResolvedValueOnce(mockCourse1)
        .mockResolvedValueOnce(mockCourse2);

      const result = await service.bulkApproveCourses(
        { ids: [mockCourse1.id, mockCourse2.id], action: ContentStatus.APPROVED },
        testAdminId,
      );

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures in bulk operation', async () => {
      const mockCourse1 = {
        _id: new Types.ObjectId(),
        id: new Types.ObjectId().toString(),
        save: jest.fn().mockResolvedValue(true),
      };

      mockCourseModel.findOne
        .mockResolvedValueOnce(mockCourse1)
        .mockResolvedValueOnce(null); // Second course not found

      const result = await service.bulkApproveCourses(
        { ids: [mockCourse1.id, new Types.ObjectId().toString()], action: ContentStatus.APPROVED },
        testAdminId,
      );

      expect(result.success).toBe(false);
      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ==================== ERROR HANDLING TESTS ====================
  describe('error handling', () => {
    it('should throw NotFoundException when getting non-existent course', async () => {
      mockCourseModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getCourseById('invalid-id')).rejects.toThrow('Course not found');
    });

    it('should throw NotFoundException when getting non-existent challenge', async () => {
      mockChallengeModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getChallengeById('invalid-id')).rejects.toThrow('Challenge not found');
    });

    it('should throw NotFoundException when getting non-existent event', async () => {
      mockEventModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getEventById('invalid-id')).rejects.toThrow('Event not found');
    });

    it('should throw NotFoundException when getting non-existent post', async () => {
      mockPostModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getPostById('invalid-id')).rejects.toThrow('Post not found');
    });
  });

  // ==================== PAGINATION TESTS ====================
  describe('pagination', () => {
    it('should calculate correct pagination values', async () => {
      const mockCourses = Array(25).fill(null).map((_, i) => ({
        _id: new Types.ObjectId(),
        id: `course-${i}`,
        titre: `Course ${i}`,
        description: `Description ${i}`,
        creatorId: new Types.ObjectId(testUserId),
        communityId: testCommunityId,
        prix: 0,
        isPublished: true,
        approvalStatus: ContentStatus.APPROVED,
        sections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockCourseModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockCourses.slice(0, 20)),
            }),
          }),
        }),
      });
      mockCourseModel.countDocuments.mockResolvedValue(25);
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: testUserId,
            name: 'Test User',
            email: 'test@example.com',
          }),
        }),
      });
      mockCommunityModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            id: testCommunityId,
            name: 'Test Community',
            slug: 'test-community',
          }),
        }),
      });
      mockEnrollmentModel.countDocuments.mockResolvedValue(0);

      // Page 1
      let result = await service.getCourses({ page: 1, limit: 20 }, testAdminId);
      expect(result.data).toHaveLength(20);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPrevPage).toBe(false);

      // Update mock for page 2
      mockCourseModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockCourses.slice(20, 25)),
            }),
          }),
        }),
      });

      // Page 2
      result = await service.getCourses({ page: 2, limit: 20 }, testAdminId);
      expect(result.data).toHaveLength(5);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(true);
    });
  });
});

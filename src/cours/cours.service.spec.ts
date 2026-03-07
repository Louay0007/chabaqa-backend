import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { CoursService } from './cours.service';
import { UserCourseNote } from '../schema/user-course-note.schema';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { PolicyService } from '../common/services/policy.service';
import { FeeService } from '../common/services/fee.service';
import { PromoService } from '../common/services/promo.service';
import { NotificationService } from '../notification/notification.service';
import { AchievementService } from '../achievement/achievement.service';
import { UploadService } from '../upload/upload.service';
import { CacheService } from '../common/services/cache.service';

describe('CoursService chapter entitlement persistence', () => {
  let service: CoursService;

  const mockOrderModel: any = {
    findOne: jest.fn(),
  };

  const mockCacheService: any = {
    deletePattern: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursService,
        { provide: getModelToken('Cours'), useValue: {} },
        { provide: getModelToken('CourseEnrollment'), useValue: {} },
        { provide: getModelToken('CourseProgress'), useValue: {} },
        { provide: getModelToken(UserCourseNote.name), useValue: {} },
        { provide: getModelToken('Community'), useValue: {} },
        { provide: getModelToken('User'), useValue: {} },
        { provide: getModelToken('Order'), useValue: mockOrderModel },
        { provide: getModelToken('ContentProgress'), useValue: {} },
        { provide: ContentTrackingService, useValue: {} },
        { provide: PolicyService, useValue: {} },
        { provide: FeeService, useValue: {} },
        { provide: PromoService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: AchievementService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CoursService>(CoursService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persists chapter entitlement when paid order exists but enrollment lacks purchasedChapterIds', async () => {
    const userId = new Types.ObjectId().toString();
    const chapterId = 'chapter-2';

    mockOrderModel.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({ _id: 'paid-order' }),
      }),
    });

    const enrollment: any = {
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };

    const result = await (service as any).hasPaidChapterEntitlement(userId, chapterId, enrollment);

    expect(result).toBe(true);
    expect(enrollment.purchasedChapterIds).toEqual([chapterId]);
    expect(enrollment.save).toHaveBeenCalledTimes(1);
  });

  it('is idempotent and does not duplicate entitlement across repeated checks', async () => {
    const userId = new Types.ObjectId().toString();
    const chapterId = 'chapter-2';

    mockOrderModel.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({ _id: 'paid-order' }),
      }),
    });

    const enrollment: any = {
      purchasedChapterIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };

    const first = await (service as any).hasPaidChapterEntitlement(userId, chapterId, enrollment);
    const second = await (service as any).hasPaidChapterEntitlement(userId, chapterId, enrollment);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(enrollment.purchasedChapterIds).toEqual([chapterId]);
    expect(enrollment.save).toHaveBeenCalledTimes(1);
    expect(mockOrderModel.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('CoursService enrollment independence from course payment', () => {
  it('allows enrollment in a paid course without requiring a paid course order', async () => {
    const userId = new Types.ObjectId().toString();
    const courseObjectId = new Types.ObjectId();
    const enrolledAt = new Date('2026-01-01T00:00:00.000Z');

    const courseDoc: any = {
      _id: courseObjectId,
      id: 'course-public-id',
      titre: 'Paid Course',
      prix: 120,
      isPublished: true,
      communityId: new Types.ObjectId(),
      creatorId: new Types.ObjectId(),
      ajouterInscription: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const courseEnrollmentModel: any = function (this: any, payload: any) {
      Object.assign(this, payload);
      this.save = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        id: 'enrollment-id',
        userId: payload.userId,
        enrolledAt,
        isActive: true,
      });
    };
    courseEnrollmentModel.findOne = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });

    const coursModel: any = {
      findById: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue(courseDoc),
      }),
      findOne: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue(courseDoc),
      }),
    };

    const orderModel: any = {
      findOne: jest.fn(),
    };

    const service = new CoursService(
      coursModel,
      courseEnrollmentModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { deletePattern: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const result = await service.inscrireAuCours(courseObjectId.toString(), userId);

    expect(result.message).toContain('Inscription au cours réussie');
    expect(result.enrollment.courseId).toBe('course-public-id');
    expect(courseDoc.ajouterInscription).toHaveBeenCalledTimes(1);
    expect(orderModel.findOne).not.toHaveBeenCalled();
  });
});

describe('CoursService profile by-user community enrichment', () => {
  it('adds community object and flat community fields to enrolled and created courses', async () => {
    const userId = new Types.ObjectId().toString();
    const communityKey = 'community-custom-id';

    const enrollmentCourse: any = {
      _id: new Types.ObjectId(),
      titre: 'Enrolled course',
      description: 'Desc',
      thumbnail: '',
      communityId: communityKey,
      creatorId: { name: 'Creator A', profile_picture: '' },
      sections: [{ chapitres: [{}, {}] }],
    };

    const enrollmentFind = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          courseId: enrollmentCourse,
          enrolledAt: new Date('2025-01-01T00:00:00.000Z'),
          progression: [{ isCompleted: true }],
        },
      ]),
    };

    const createdFind = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          titre: 'Created course',
          description: 'Desc',
          thumbnail: '',
          communityId: communityKey,
          isPublished: false,
          createdAt: new Date('2025-01-02T00:00:00.000Z'),
          creatorId: { name: 'Creator B', profile_picture: '' },
        },
      ]),
    };

    const courseEnrollmentModel: any = {
      find: jest.fn().mockReturnValue(enrollmentFind),
    };

    const coursModel: any = {
      find: jest.fn().mockReturnValue(createdFind),
    };

    const communityModel: any = {
      find: jest.fn().mockResolvedValue([
        { _id: new Types.ObjectId(), id: communityKey, name: 'Tech Community', slug: 'tech-community' },
      ]),
    };

    const service = new CoursService(
      coursModel,
      courseEnrollmentModel,
      {} as any,
      {} as any,
      communityModel,
      {} as any,
      {} as any,
      {} as any,
      { syncProgressSnapshot: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.obtenirCoursParUtilisateur(userId, 1, 12, 'all');
    expect(result.success).toBe(true);
    expect(result.data.courses).toHaveLength(2);
    expect(result.data.courses.every((course: any) => course.communityName === 'Tech Community')).toBe(true);
    expect(result.data.courses.every((course: any) => course.communitySlug === 'tech-community')).toBe(true);
    expect(result.data.courses.every((course: any) => course.slug === 'tech-community')).toBe(true);
    expect(result.data.courses.every((course: any) => course.community?.slug === 'tech-community')).toBe(true);
  });

  it('hides enrolled courses for public scope and filters created courses to published only', async () => {
    const userId = new Types.ObjectId().toString();

    const enrollmentFind = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    const createdFind = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          titre: 'Published course',
          description: 'Desc',
          thumbnail: '',
          communityId: new Types.ObjectId().toString(),
          isPublished: true,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          creatorId: { name: 'Creator', profile_picture: '' },
        },
      ]),
    };

    const courseEnrollmentModel: any = {
      find: jest.fn().mockReturnValue(enrollmentFind),
    };

    const coursModel: any = {
      find: jest.fn().mockReturnValue(createdFind),
    };

    const service = new CoursService(
      coursModel,
      courseEnrollmentModel,
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      {} as any,
      { syncProgressSnapshot: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.obtenirCoursParUtilisateur(userId, 1, 12, 'all', 'public');

    expect(courseEnrollmentModel.find).not.toHaveBeenCalled();
    const createdQuery = coursModel.find.mock.calls[0][0];
    expect(String(createdQuery.creatorId)).toBe(userId);
    expect(createdQuery.isPublished).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data.courses).toHaveLength(1);
    expect(result.data.courses[0].type).toBe('created');
  });
});

describe('CoursService chapter video/content validation', () => {
  let service: CoursService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursService,
        { provide: getModelToken('Cours'), useValue: {} },
        { provide: getModelToken('CourseEnrollment'), useValue: {} },
        { provide: getModelToken('CourseProgress'), useValue: {} },
        { provide: getModelToken(UserCourseNote.name), useValue: {} },
        { provide: getModelToken('Community'), useValue: {} },
        { provide: getModelToken('User'), useValue: {} },
        { provide: getModelToken('Order'), useValue: {} },
        { provide: getModelToken('ContentProgress'), useValue: {} },
        { provide: ContentTrackingService, useValue: {} },
        { provide: PolicyService, useValue: {} },
        { provide: FeeService, useValue: {} },
        { provide: PromoService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: AchievementService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: CacheService, useValue: { deletePattern: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<CoursService>(CoursService);
  });

  it('accepts video-only chapter payloads for create/add flows', () => {
    expect(() =>
      (service as any).assertChapterHasContentOrVideo('', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).not.toThrow();
  });

  it('rejects chapter payload when both description and video are empty', () => {
    expect(() => (service as any).assertChapterHasContentOrVideo('   ', '   ')).toThrow(
      BadRequestException,
    );
  });

  it('rejects unsupported host when chapter videoUrl is changed', () => {
    expect(() =>
      (service as any).resolveChapterVideoUrlForUpdate(
        '/uploads/video/chapter-1.mp4',
        'https://example.com/video.mp4',
      ),
    ).toThrow(BadRequestException);
  });

  it('allows unchanged legacy unsupported chapter videoUrl on update', () => {
    const legacyUrl = 'https://legacy.invalid-host.com/video.mp4';
    expect((service as any).resolveChapterVideoUrlForUpdate(legacyUrl, legacyUrl)).toBe(legacyUrl);
  });
});

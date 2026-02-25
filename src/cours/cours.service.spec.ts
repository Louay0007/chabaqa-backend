import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
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

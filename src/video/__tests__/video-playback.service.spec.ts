import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { VideoPlaybackService } from '../video-playback.service';
import { PlaybackSession, PlaybackSessionStatus } from '../../schema/playback-session.schema';
import { ChapterAccessService } from '../../common/services/chapter-access.service';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Valid 24-char hex ObjectId for tests */
const TEST_USER_ID = '65a1b2c3d4e5f6a7b8c9d0e1';

// ─── Mock helpers ───────────────────────────────────────────────────────────

function createMockSession(overrides: Partial<any> = {}) {
  return {
    _id: 'session-id',
    userId: TEST_USER_ID,
    courseId: 'course-1',
    chapterId: 'chapter-1',
    sessionToken: 'ps_1234_abcdef1234567890abcdef1234567890',
    videoStorageKey: 'video/test-video.mp4',
    streamType: 'mp4',
    status: PlaybackSessionStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 300_000), // 5 min from now
    ipHash: 'abc123',
    uaHash: 'def456',
    watermarkText: 'usr*** • 2025-01-01 12:00 • 12345678',
    watermarkSessionShort: '12345678',
    requestCount: 0,
    ...overrides,
  };
}

function createMockCourse(overrides: Partial<any> = {}) {
  return {
    _id: 'course-obj-id',
    id: 'course-1',
    titre: 'Test Course',
    sections: [
      {
        id: 'section-1',
        titre: 'Section 1',
        ordre: 0,
        chapitres: [
          {
            id: 'chapter-1',
            titre: 'Chapter 1',
            videoUrl: '/uploads/video/test-video.mp4',
            isPreview: false,
            isPaidChapter: false,
            ordre: 0,
          },
          {
            id: 'chapter-2',
            titre: 'Chapter 2 (YouTube)',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9',
            isPreview: false,
            isPaidChapter: false,
            ordre: 1,
          },
          {
            id: 'chapter-no-video',
            titre: 'Chapter No Video',
            videoUrl: '',
            isPreview: false,
            isPaidChapter: false,
            ordre: 2,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VideoPlaybackService', () => {
  let service: VideoPlaybackService;
  let mockSessionModel: any;
  let mockChapterAccessService: any;

  beforeEach(async () => {
    mockSessionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
    };

    mockChapterAccessService = {
      resolveCourse: jest.fn(),
      findChapterDescriptor: jest.fn(),
      buildAccessContext: jest.fn(),
      evaluateChapterAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoPlaybackService,
        {
          provide: getModelToken(PlaybackSession.name),
          useValue: mockSessionModel,
        },
        {
          provide: ChapterAccessService,
          useValue: mockChapterAccessService,
        },
      ],
    }).compile();

    service = module.get<VideoPlaybackService>(VideoPlaybackService);
  });

  // ─── createPlaybackSession ──────────────────────────────────────────────

  describe('createPlaybackSession', () => {
    it('should throw NotFoundException if chapter not found', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue(undefined);

      await expect(
        service.createPlaybackSession(TEST_USER_ID, 'course-1', 'nonexistent', '127.0.0.1', 'Chrome'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if access denied', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue({
        chapter: course.sections[0].chapitres[0],
        section: course.sections[0],
        index: 0,
      });
      mockChapterAccessService.buildAccessContext.mockResolvedValue({});
      mockChapterAccessService.evaluateChapterAccess.mockReturnValue({
        canAccess: false,
        reason: 'Enrollment required',
        lockCode: 'enrollment_required',
      });

      await expect(
        service.createPlaybackSession(TEST_USER_ID, 'course-1', 'chapter-1', '127.0.0.1', 'Chrome'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for YouTube/external videos', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue({
        chapter: course.sections[0].chapitres[1], // YouTube chapter
        section: course.sections[0],
        index: 1,
      });
      mockChapterAccessService.buildAccessContext.mockResolvedValue({});
      mockChapterAccessService.evaluateChapterAccess.mockReturnValue({ canAccess: true });

      await expect(
        service.createPlaybackSession(TEST_USER_ID, 'course-1', 'chapter-2', '127.0.0.1', 'Chrome'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for chapter with no video', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue({
        chapter: course.sections[0].chapitres[2], // No video
        section: course.sections[0],
        index: 2,
      });
      mockChapterAccessService.buildAccessContext.mockResolvedValue({});
      mockChapterAccessService.evaluateChapterAccess.mockReturnValue({ canAccess: true });

      await expect(
        service.createPlaybackSession(TEST_USER_ID, 'course-1', 'chapter-no-video', '127.0.0.1', 'Chrome'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should expire oldest session when concurrency limit reached', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue({
        chapter: course.sections[0].chapitres[0],
        section: course.sections[0],
        index: 0,
      });
      mockChapterAccessService.buildAccessContext.mockResolvedValue({});
      mockChapterAccessService.evaluateChapterAccess.mockReturnValue({ canAccess: true });
      mockSessionModel.countDocuments.mockResolvedValue(2); // At limit
      mockSessionModel.findOneAndUpdate.mockResolvedValue({});
      mockSessionModel.create.mockResolvedValue(createMockSession());

      // Mock existsSync for the video file check
      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

      await service.createPlaybackSession(TEST_USER_ID, 'course-1', 'chapter-1', '127.0.0.1', 'Chrome');

      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PlaybackSessionStatus.ACTIVE,
        }),
        { status: PlaybackSessionStatus.EXPIRED },
        { sort: { createdAt: 1 } },
      );
    });

    it('should return session with correct structure on success', async () => {
      const course = createMockCourse();
      mockChapterAccessService.resolveCourse.mockResolvedValue(course);
      mockChapterAccessService.findChapterDescriptor.mockReturnValue({
        chapter: course.sections[0].chapitres[0],
        section: course.sections[0],
        index: 0,
      });
      mockChapterAccessService.buildAccessContext.mockResolvedValue({});
      mockChapterAccessService.evaluateChapterAccess.mockReturnValue({ canAccess: true });
      mockSessionModel.countDocuments.mockResolvedValue(0);
      mockSessionModel.create.mockImplementation((data: any) => ({
        ...data,
        _id: 'new-session-id',
      }));

      jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

      const result = await service.createPlaybackSession(TEST_USER_ID, 'course-1', 'chapter-1', '127.0.0.1', 'Chrome');

      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toMatch(/^ps_/);
      expect(result).toHaveProperty('streamUrl');
      expect(result.streamUrl).toContain('/api/video/stream/');
      expect(result).toHaveProperty('streamType');
      expect(['mp4', 'hls']).toContain(result.streamType);
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('watermark');
      expect(result.watermark).toHaveProperty('text');
      expect(result.watermark).toHaveProperty('sessionShort');
    });
  });

  // ─── validateAndGetRedirectPath ──────────────────────────────────────────

  describe('validateAndGetRedirectPath', () => {
    it('should return null for unknown session token', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      const result = await service.validateAndGetRedirectPath('bad-token', '127.0.0.1', 'Chrome');
      expect(result).toBeNull();
    });

    it('should expire and return null for expired session', async () => {
      const expired = createMockSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSessionModel.findOne.mockResolvedValue(expired);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetRedirectPath(expired.sessionToken, '127.0.0.1', 'Chrome');
      expect(result).toBeNull();
      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: expired._id },
        { status: PlaybackSessionStatus.EXPIRED },
      );
    });

    it('should revoke session exceeding max request count', async () => {
      const overused = createMockSession({ requestCount: 5000 });
      mockSessionModel.findOne.mockResolvedValue(overused);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetRedirectPath(overused.sessionToken, '127.0.0.1', 'Chrome');
      expect(result).toBeNull();
      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: overused._id },
        { status: PlaybackSessionStatus.REVOKED },
      );
    });

    it('should return internal MP4 redirect path for valid session', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetRedirectPath(session.sessionToken, '127.0.0.1', 'Chrome');

      expect(result).not.toBeNull();
      expect(result!.internalPath).toBe('/internal_videos/video/test-video.mp4');
      expect(result!.contentType).toBe('video/mp4');
    });

    it('should return HLS master manifest path for HLS session', async () => {
      const session = createMockSession({ streamType: 'hls' });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetRedirectPath(session.sessionToken, '127.0.0.1', 'Chrome');

      expect(result).not.toBeNull();
      expect(result!.internalPath).toBe('/internal_hls/video/test-video/master.m3u8');
      expect(result!.contentType).toBe('application/vnd.apple.mpegurl');
    });

    it('should increment request count on valid access', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.validateAndGetRedirectPath(session.sessionToken, '127.0.0.1', 'Chrome');

      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: session._id },
        expect.objectContaining({ $inc: { requestCount: 1 } }),
      );
    });
  });

  // ─── validateAndGetSegmentPath ──────────────────────────────────────────

  describe('validateAndGetSegmentPath', () => {
    it('should return null for invalid session', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      const result = await service.validateAndGetSegmentPath('bad', 'seg_000.ts', '127.0.0.1');
      expect(result).toBeNull();
    });

    it('should block path traversal attempts', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);

      const result = await service.validateAndGetSegmentPath(
        session.sessionToken,
        '../../../etc/passwd',
        '127.0.0.1',
      );
      expect(result).toBeNull();
    });

    it('should block absolute path segments', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);

      const result = await service.validateAndGetSegmentPath(
        session.sessionToken,
        '/etc/passwd',
        '127.0.0.1',
      );
      expect(result).toBeNull();
    });

    it('should return correct path for .ts segments', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetSegmentPath(
        session.sessionToken,
        'seg_003.ts',
        '127.0.0.1',
      );

      expect(result).not.toBeNull();
      expect(result!.internalPath).toBe('/internal_hls/video/test-video/seg_003.ts');
      expect(result!.contentType).toBe('video/mp2t');
    });

    it('should return correct content-type for .m3u8 manifests', async () => {
      const session = createMockSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.validateAndGetSegmentPath(
        session.sessionToken,
        'stream.m3u8',
        '127.0.0.1',
      );

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('application/vnd.apple.mpegurl');
    });
  });

  // ─── extendSession ──────────────────────────────────────────────────────

  describe('extendSession', () => {
    it('should return true on successful extension', async () => {
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.extendSession('ps_token', TEST_USER_ID);
      expect(result).toBe(true);
    });

    it('should return false if session not found or not active', async () => {
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 0 });

      const result = await service.extendSession('invalid', TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  // ─── revokeAllUserSessions ──────────────────────────────────────────────

  describe('revokeAllUserSessions', () => {
    it('should revoke all active sessions for a user', async () => {
      mockSessionModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await service.revokeAllUserSessions(TEST_USER_ID);
      expect(result).toBe(3);
    });
  });

  // ─── revokeSession ─────────────────────────────────────────────────

  describe('revokeSession', () => {
    it('should revoke a specific session by token', async () => {
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.revokeSession('ps_token');
      expect(result).toBe(true);
    });

    it('should return false if session already expired/revoked', async () => {
      mockSessionModel.updateOne.mockResolvedValue({ modifiedCount: 0 });

      const result = await service.revokeSession('ps_old');
      expect(result).toBe(false);
    });
  });

  // ─── getActiveSessionCount ──────────────────────────────────────────────

  describe('getActiveSessionCount', () => {
    it('should return count of active sessions', async () => {
      mockSessionModel.countDocuments.mockResolvedValue(2);

      const count = await service.getActiveSessionCount(TEST_USER_ID);
      expect(count).toBe(2);
    });
  });
});

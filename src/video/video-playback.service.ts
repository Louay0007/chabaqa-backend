import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  PlaybackSession,
  PlaybackSessionDocument,
  PlaybackSessionStatus,
} from '../schema/playback-session.schema';
import { ChapterAccessService } from '../common/services/chapter-access.service';

/** Maximum concurrent active sessions per user */
const MAX_CONCURRENT_SESSIONS = 2;

/** Default session TTL in seconds (5 minutes) */
const SESSION_TTL_SECONDS = 300;

/** Maximum session creations per user per minute (rate limiting done at app level) */
export const SESSION_RATE_LIMIT_PER_MIN = 10;

/** Maximum requests per session before revocation */
const MAX_REQUESTS_PER_SESSION = 5000;

@Injectable()
export class VideoPlaybackService {
  private readonly uploadsRoot = join(
    process.cwd(),
    process.env.UPLOAD_PATH || 'uploads',
  );

  private readonly hlsRoot = join(
    process.cwd(),
    process.env.HLS_PATH || 'hls-output',
  );

  constructor(
    @InjectModel(PlaybackSession.name)
    private readonly sessionModel: Model<PlaybackSessionDocument>,
    private readonly chapterAccessService: ChapterAccessService,
  ) {}

  /**
   * Create a playback session for a chapter, after verifying entitlements.
   */
  async createPlaybackSession(
    userId: string,
    courseId: string,
    chapterId: string,
    clientIp: string,
    userAgent: string,
  ): Promise<{
    sessionId: string;
    streamUrl: string;
    streamType: 'mp4' | 'hls';
    expiresAt: Date;
    watermark: { text: string; sessionShort: string };
  }> {
    // 1. Resolve course and chapter
    const course = await this.chapterAccessService.resolveCourse(courseId);
    const descriptor = this.chapterAccessService.findChapterDescriptor(course, chapterId);
    if (!descriptor) {
      throw new NotFoundException('Chapter not found');
    }

    const chapter = descriptor.chapter;

    // 2. Check entitlements via existing access service
    const accessCtx = await this.chapterAccessService.buildAccessContext(userId, courseId);
    const decision = this.chapterAccessService.evaluateChapterAccess(accessCtx, chapterId);

    if (!decision.canAccess) {
      throw new ForbiddenException({
        message: decision.reason || 'Chapter access denied',
        code: 'CHAPTER_ACCESS_DENIED',
        lockCode: decision.lockCode,
        needsPayment: decision.needsPayment,
        chapterPrice: decision.chapterPrice,
      });
    }

    // 3. Resolve video storage key
    const videoUrl: string = chapter.videoUrl || '';
    const storageKey = this.extractStorageKey(videoUrl);
    if (!storageKey) {
      throw new BadRequestException(
        'This chapter has no locally hosted video available for streaming',
      );
    }

    // 4. Determine stream type — check if HLS exists
    const hlsDir = join(this.hlsRoot, storageKey.replace(/\.[^.]+$/, ''));
    const hasHls = existsSync(join(hlsDir, 'master.m3u8'));
    const streamType: 'mp4' | 'hls' = hasHls ? 'hls' : 'mp4';

    // 5. Verify source file exists
    if (streamType === 'mp4') {
      const mp4Path = join(this.uploadsRoot, storageKey);
      if (!existsSync(mp4Path)) {
        throw new NotFoundException('Video file not found on server');
      }
    }

    // 6. Enforce concurrency limit
    const activeCount = await this.sessionModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: PlaybackSessionStatus.ACTIVE,
      expiresAt: { $gt: new Date() },
    });

    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      // Expire the oldest session to make room
      await this.sessionModel.findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          status: PlaybackSessionStatus.ACTIVE,
          expiresAt: { $gt: new Date() },
        },
        { status: PlaybackSessionStatus.EXPIRED },
        { sort: { createdAt: 1 } },
      );
    }

    // 7. Generate session token
    const sessionToken = `ps_${Date.now()}_${randomBytes(16).toString('hex')}`;
    const ipHash = createHash('sha256').update(clientIp || 'unknown').digest('hex').slice(0, 16);
    const uaHash = createHash('sha256').update(userAgent || 'unknown').digest('hex').slice(0, 16);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

    // 8. Build watermark
    const watermarkSessionShort = sessionToken.slice(-8);
    const maskedUserId = userId.slice(0, 4) + '***' + userId.slice(-3);
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const watermarkText = `${maskedUserId} • ${timestamp} • ${watermarkSessionShort}`;

    // 9. Create session document
    const session = await this.sessionModel.create({
      userId: new Types.ObjectId(userId),
      courseId,
      chapterId,
      sessionToken,
      videoStorageKey: storageKey,
      streamType,
      status: PlaybackSessionStatus.ACTIVE,
      expiresAt,
      ipHash,
      uaHash,
      watermarkText,
      watermarkSessionShort,
      requestCount: 0,
    });

    const streamUrl = `/api/video/stream/${sessionToken}`;

    return {
      sessionId: sessionToken,
      streamUrl,
      streamType,
      expiresAt,
      watermark: {
        text: watermarkText,
        sessionShort: watermarkSessionShort,
      },
    };
  }

  /**
   * Validate a session and return the internal path for X-Accel-Redirect.
   * Returns null if session invalid/expired.
   */
  async validateAndGetRedirectPath(
    sessionToken: string,
    clientIp: string,
    userAgent: string,
  ): Promise<{
    internalPath: string;
    contentType: string;
    session: PlaybackSessionDocument;
  } | null> {
    const session = await this.sessionModel.findOne({
      sessionToken,
      status: PlaybackSessionStatus.ACTIVE,
    });

    if (!session) return null;

    // Check expiry
    if (session.expiresAt < new Date()) {
      await this.sessionModel.updateOne(
        { _id: session._id },
        { status: PlaybackSessionStatus.EXPIRED },
      );
      return null;
    }

    // Validate IP binding (optional — can be relaxed)
    const currentIpHash = createHash('sha256').update(clientIp || 'unknown').digest('hex').slice(0, 16);
    if (session.ipHash && session.ipHash !== currentIpHash) {
      // Log suspicious activity but don't block (VPN users change IP)
      console.warn(
        `[VideoPlayback] IP mismatch for session ${sessionToken}: expected=${session.ipHash}, got=${currentIpHash}`,
      );
    }

    // Check request count
    if (session.requestCount >= MAX_REQUESTS_PER_SESSION) {
      await this.sessionModel.updateOne(
        { _id: session._id },
        { status: PlaybackSessionStatus.REVOKED },
      );
      return null;
    }

    // Increment request count and update last access
    await this.sessionModel.updateOne(
      { _id: session._id },
      {
        $inc: { requestCount: 1 },
        lastAccessedAt: new Date(),
      },
    );

    const storageKey = session.videoStorageKey;

    if (session.streamType === 'hls') {
      // For HLS, return master manifest path
      const hlsDir = storageKey.replace(/\.[^.]+$/, '');
      return {
        internalPath: `/internal_hls/${hlsDir}/master.m3u8`,
        contentType: 'application/vnd.apple.mpegurl',
        session,
      };
    }

    // MP4 — X-Accel-Redirect to internal location
    return {
      internalPath: `/internal_videos/${storageKey}`,
      contentType: 'video/mp4',
      session,
    };
  }

  /**
   * Validate session and return path for a specific HLS segment.
   */
  async validateAndGetSegmentPath(
    sessionToken: string,
    segmentPath: string,
    clientIp: string,
  ): Promise<{ internalPath: string; contentType: string } | null> {
    const session = await this.sessionModel.findOne({
      sessionToken,
      status: PlaybackSessionStatus.ACTIVE,
    });

    if (!session || session.expiresAt < new Date()) return null;

    // Prevent path traversal
    const sanitized = segmentPath.replace(/\.\./g, '').replace(/\/+/g, '/');
    if (sanitized.includes('..') || sanitized.startsWith('/')) return null;

    const storageKey = session.videoStorageKey;
    const hlsDir = storageKey.replace(/\.[^.]+$/, '');

    // Increment request count
    await this.sessionModel.updateOne(
      { _id: session._id },
      {
        $inc: { requestCount: 1 },
        lastAccessedAt: new Date(),
      },
    );

    const isManifest = sanitized.endsWith('.m3u8');
    const contentType = isManifest
      ? 'application/vnd.apple.mpegurl'
      : 'video/mp2t';

    return {
      internalPath: `/internal_hls/${hlsDir}/${sanitized}`,
      contentType,
    };
  }

  /**
   * Deliver HLS AES-128 key for a valid session, with rotation index.
   */
  async getHlsKey(
    sessionToken: string,
    rotationIndex: number,
  ): Promise<Buffer | null> {
    const session = await this.sessionModel.findOne({
      sessionToken,
      status: PlaybackSessionStatus.ACTIVE,
    });

    if (!session || session.expiresAt < new Date()) return null;

    const storageKey = session.videoStorageKey;
    const hlsDir = storageKey.replace(/\.[^.]+$/, '');
    const keyFilename = `key_${rotationIndex}.bin`;
    const keyPath = join(this.hlsRoot, hlsDir, keyFilename);

    if (!existsSync(keyPath)) {
      // Fallback to single key file
      const fallbackPath = join(this.hlsRoot, hlsDir, 'enc.key');
      if (!existsSync(fallbackPath)) return null;
      return readFileSync(fallbackPath);
    }

    return readFileSync(keyPath);
  }

  /**
   * Extend a session TTL (for active viewers).
   */
  async extendSession(sessionToken: string, userId: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      {
        sessionToken,
        userId: new Types.ObjectId(userId),
        status: PlaybackSessionStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
      },
      {
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Revoke all sessions for a user (admin action).
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        status: PlaybackSessionStatus.ACTIVE,
      },
      { status: PlaybackSessionStatus.REVOKED },
    );
    return result.modifiedCount;
  }

  /**
   * Revoke a specific session.
   */
  async revokeSession(sessionToken: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      { sessionToken, status: PlaybackSessionStatus.ACTIVE },
      { status: PlaybackSessionStatus.REVOKED },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Get active session count for a user.
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    return this.sessionModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: PlaybackSessionStatus.ACTIVE,
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Extract storage key from various videoUrl formats.
   * Returns null for YouTube/Vimeo/external URLs.
   */
  private extractStorageKey(videoUrl: string): string | null {
    if (!videoUrl) return null;

    // Direct storage key format: "video/1234-uuid.mp4"
    if (/^video\//.test(videoUrl)) return videoUrl;

    // Relative path: "/uploads/video/1234-uuid.mp4"
    const relMatch = videoUrl.match(/\/?uploads\/(video\/[^\s?#]+)/i);
    if (relMatch) return relMatch[1];

    // Absolute URL: "https://api.chabaqa.io/uploads/video/1234-uuid.mp4"
    try {
      const url = new URL(videoUrl);
      const pathMatch = url.pathname.match(/\/?uploads\/(video\/[^\s?#]+)/i);
      if (pathMatch) return pathMatch[1];
    } catch {
      // Not a valid URL
    }

    return null;
  }
}

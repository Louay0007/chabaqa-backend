import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VideoPlaybackService } from './video-playback.service';

@ApiTags('Video Playback')
@Controller('video')
export class VideoController {
  constructor(private readonly videoPlaybackService: VideoPlaybackService) {}

  private getUserId(req: any): string {
    const userId = (
      req?.user?._id ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
    if (!userId) {
      throw new BadRequestException('User identification required');
    }
    return userId;
  }

  /**
   * Create a short-lived playback session for a chapter video.
   * Requires authentication and chapter entitlement.
   */
  @Post('playback-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Create a playback session for a chapter video' })
  async createPlaybackSession(
    @Request() req: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const userId = this.getUserId(req);
    const { courseId, chapterId } = req.body || {};

    if (!courseId || !chapterId) {
      throw new BadRequestException('courseId and chapterId are required');
    }

    const result = await this.videoPlaybackService.createPlaybackSession(
      userId,
      courseId,
      chapterId,
      ip,
      userAgent || '',
    );

    return { success: true, data: result };
  }

  /**
   * Stream video via X-Accel-Redirect (MP4 or HLS master manifest).
   * The backend returns headers only — Nginx serves the bytes from internal location.
   */
  @Get('stream/:sessionToken')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  @ApiOperation({ summary: 'Stream video via X-Accel-Redirect' })
  async streamVideo(
    @Param('sessionToken') sessionToken: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.videoPlaybackService.validateAndGetRedirectPath(
      sessionToken,
      ip,
      userAgent || '',
    );

    if (!result) {
      res.status(403).json({
        statusCode: 403,
        message: 'Playback session expired or invalid',
        code: 'SESSION_INVALID',
      });
      return;
    }

    // Set security headers — no caching, no embedding
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', result.contentType);

    // Forward range header for MP4 seeking
    if (range) {
      res.setHeader('X-Accel-Buffering', 'no');
    }

    // X-Accel-Redirect: Nginx will serve the file from internal location
    res.setHeader('X-Accel-Redirect', result.internalPath);
    res.status(200).end();
  }

  /**
   * Serve an HLS segment via X-Accel-Redirect.
   */
  @Get('hls/:sessionToken/*segmentPath')
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  @ApiOperation({ summary: 'Serve HLS segment via X-Accel-Redirect' })
  async streamHlsSegment(
    @Param('sessionToken') sessionToken: string,
    @Param('segmentPath') segmentPath: string,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    const result = await this.videoPlaybackService.validateAndGetSegmentPath(
      sessionToken,
      segmentPath,
      ip,
    );

    if (!result) {
      res.status(403).json({
        statusCode: 403,
        message: 'Playback session expired or invalid',
        code: 'SESSION_INVALID',
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('X-Accel-Redirect', result.internalPath);
    res.status(200).end();
  }

  /**
   * Deliver AES-128 key for HLS decryption.
   * Rate-limited, no-store, requires valid session.
   */
  @Get('hls-key')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get HLS AES-128 decryption key' })
  async getHlsKey(
    @Query('s') sessionToken: string,
    @Query('r') rotationIndex: string,
    @Res() res: Response,
  ) {
    if (!sessionToken) {
      res.status(400).json({ message: 'Session token required' });
      return;
    }

    const rotation = parseInt(rotationIndex || '0', 10);
    const key = await this.videoPlaybackService.getHlsKey(sessionToken, rotation);

    if (!key) {
      res.status(403).json({
        statusCode: 403,
        message: 'Key delivery denied',
        code: 'KEY_DENIED',
      });
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', key.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Restrict CORS — no cross-origin access
    res.removeHeader('Access-Control-Allow-Origin');
    res.send(key);
  }

  /**
   * Extend an active playback session (heartbeat from player).
   */
  @Post('extend-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Extend playback session TTL' })
  async extendSession(@Request() req: any) {
    const userId = this.getUserId(req);
    const { sessionId } = req.body || {};

    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const extended = await this.videoPlaybackService.extendSession(sessionId, userId);
    return { success: true, data: { extended } };
  }

  /**
   * Admin: revoke all sessions for a user.
   */
  @Post('admin/revoke-user-sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: revoke all video sessions for a user' })
  async revokeUserSessions(@Request() req: any) {
    const role = (req?.user?.role || '').toString().toLowerCase();
    if (role !== 'admin' && req?.user?.isAdmin !== true) {
      throw new BadRequestException('Admin access required');
    }

    const { userId } = req.body || {};
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const count = await this.videoPlaybackService.revokeAllUserSessions(userId);
    return { success: true, data: { revokedCount: count } };
  }
}

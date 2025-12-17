import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BotDetectionService, RequestFingerprint, BehaviorMetrics } from '../services/bot-detection.service';
import { SecurityService } from '../services/security.service';

/**
 * Decorator to skip bot detection for specific endpoints
 */
export const SkipBotDetection = () => 
  Reflect.metadata('skipBotDetection', true);

/**
 * Decorator to require CAPTCHA for specific endpoints
 */
export const RequireCaptcha = () =>
  Reflect.metadata('requireCaptcha', true);

/**
 * Decorator to set custom bot detection threshold
 */
export const BotDetectionThreshold = (threshold: number) =>
  Reflect.metadata('botDetectionThreshold', threshold);

@Injectable()
export class BotDetectionGuard implements CanActivate {
  private readonly logger = new Logger(BotDetectionGuard.name);

  constructor(
    private botDetectionService: BotDetectionService,
    private securityService: SecurityService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if bot detection should be skipped
    const skipDetection = this.reflector.getAllAndOverride<boolean>('skipBotDetection', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipDetection) {
      return true;
    }

    // Check if CAPTCHA is explicitly required
    const requireCaptcha = this.reflector.getAllAndOverride<boolean>('requireCaptcha', [
      context.getHandler(),
      context.getClass(),
    ]);

    const clientIP = this.getClientIP(request);
    const userAgent = request.get('User-Agent') || '';

    try {
      // If CAPTCHA is required, check if already verified
      if (requireCaptcha) {
        const isCaptchaVerified = await this.botDetectionService.isCaptchaVerified(clientIP);
        if (!isCaptchaVerified) {
          return this.handleCaptchaRequired(request, response, clientIP);
        }
        return true;
      }

      // Build request fingerprint
      const fingerprint: RequestFingerprint = {
        ip: clientIP,
        userAgent,
        acceptLanguage: request.get('Accept-Language'),
        acceptEncoding: request.get('Accept-Encoding'),
        dnr: request.get('DNT'),
        timezone: request.get('X-Timezone'),
        screenResolution: request.get('X-Screen-Resolution'),
        plugins: request.get('X-Plugins')?.split(','),
      };

      // Build behavior metrics from headers/session (if available)
      const behaviorMetrics: BehaviorMetrics | undefined = this.extractBehaviorMetrics(request);

      // Perform bot detection analysis
      const detectionResult = await this.botDetectionService.analyzeBotBehavior(
        fingerprint,
        behaviorMetrics
      );

      // Get custom threshold or use default
      const customThreshold = this.reflector.getAllAndOverride<number>('botDetectionThreshold', [
        context.getHandler(),
        context.getClass(),
      ]);

      const threshold = customThreshold ?? 70;

      // Handle detection results
      if (detectionResult.isBot && detectionResult.confidence > threshold) {
        return this.handleBotDetected(request, response, clientIP, detectionResult);
      }

      if (detectionResult.requiresCaptcha) {
        const isCaptchaVerified = await this.botDetectionService.isCaptchaVerified(clientIP);
        if (!isCaptchaVerified) {
          return this.handleCaptchaRequired(request, response, clientIP, detectionResult);
        }
      }

      // Add detection result to request for monitoring
      request.botDetection = detectionResult;

      // Log suspicious but allowed activity
      if (detectionResult.confidence > 50) {
        this.securityService.logSecurityEvent(
          'SUSPICIOUS_BOT_ACTIVITY_ALLOWED',
          {
            ip: clientIP,
            userAgent,
            confidence: detectionResult.confidence,
            reasons: detectionResult.reasons,
            url: request.url,
            method: request.method,
          },
          'info'
        );
      }

      return true;
    } catch (error) {
      this.logger.error(`Bot detection failed for ${clientIP}:`, error);
      
      // Log error but allow request (fail-open)
      this.securityService.logSecurityEvent(
        'BOT_DETECTION_ERROR',
        {
          ip: clientIP,
          userAgent,
          url: request.url,
          error: error.message,
        },
        'error'
      );

      return true;
    }
  }

  private handleBotDetected(
    request: any,
    response: any,
    clientIP: string,
    detectionResult: any
  ): boolean {
    // Log bot detection
    this.securityService.logSecurityEvent(
      'BOT_REQUEST_BLOCKED',
      {
        ip: clientIP,
        userAgent: request.get('User-Agent'),
        url: request.url,
        method: request.method,
        confidence: detectionResult.confidence,
        reasons: detectionResult.reasons,
        fingerprint: detectionResult.fingerprint,
        timestamp: new Date().toISOString(),
      },
      'warn'
    );

    // Set security headers
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Automated requests are not allowed',
        error: 'BOT_DETECTED',
        timestamp: new Date().toISOString(),
        confidence: detectionResult.confidence,
      },
      HttpStatus.FORBIDDEN
    );
  }

  private handleCaptchaRequired(
    request: any,
    response: any,
    clientIP: string,
    detectionResult?: any
  ): boolean {
    // Log CAPTCHA requirement
    this.securityService.logSecurityEvent(
      'CAPTCHA_CHALLENGE_REQUIRED',
      {
        ip: clientIP,
        userAgent: request.get('User-Agent'),
        url: request.url,
        method: request.method,
        confidence: detectionResult?.confidence,
        reasons: detectionResult?.reasons,
        timestamp: new Date().toISOString(),
      },
      'info'
    );

    // Set security headers
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow iframe for CAPTCHA
    response.setHeader('X-XSS-Protection', '1; mode=block');

    throw new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'CAPTCHA verification required',
        error: 'CAPTCHA_REQUIRED',
        timestamp: new Date().toISOString(),
        captchaEndpoint: '/api/security/captcha',
      },
      HttpStatus.UNAUTHORIZED
    );
  }

  private getClientIP(request: any): string {
    // Check multiple headers for real IP
    const headers = [
      'CF-Connecting-IP', // Cloudflare
      'True-Client-IP', // Akamai, Cloudflare
      'X-Real-IP', // Nginx
      'X-Forwarded-For', // Standard proxy header
      'X-Client-IP', // Apache
      'X-Forwarded', // Less common
      'X-Cluster-Client-IP', // Cluster
      'Forwarded-For', // RFC 7239
      'Forwarded', // RFC 7239
    ];

    for (const header of headers) {
      const value = request.get(header);
      if (value) {
        // Handle comma-separated IPs (take the first one)
        const ip = value.split(',')[0].trim();
        if (this.isValidIP(ip)) {
          return ip;
        }
      }
    }

    // Fallback to connection IP
    return request.connection?.remoteAddress || 
           request.socket?.remoteAddress || 
           request.ip || 
           'unknown';
  }

  private isValidIP(ip: string): boolean {
    // Basic IP validation (IPv4 and IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^[\da-f:]+$/i;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  private extractBehaviorMetrics(request: any): BehaviorMetrics | undefined {
    try {
      // Extract behavior metrics from custom headers (set by frontend)
      const metrics: Partial<BehaviorMetrics> = {};

      const mouseMovements = request.get('X-Mouse-Movements');
      if (mouseMovements) metrics.mouseMovements = parseInt(mouseMovements, 10);

      const keyboardEvents = request.get('X-Keyboard-Events');
      if (keyboardEvents) metrics.keyboardEvents = parseInt(keyboardEvents, 10);

      const scrollEvents = request.get('X-Scroll-Events');
      if (scrollEvents) metrics.scrollEvents = parseInt(scrollEvents, 10);

      const clickEvents = request.get('X-Click-Events');
      if (clickEvents) metrics.clickEvents = parseInt(clickEvents, 10);

      const sessionDuration = request.get('X-Session-Duration');
      if (sessionDuration) metrics.sessionDuration = parseInt(sessionDuration, 10);

      const pageViews = request.get('X-Page-Views');
      if (pageViews) metrics.pageViews = parseInt(pageViews, 10);

      const timeOnPage = request.get('X-Time-On-Page');
      if (timeOnPage) metrics.timeOnPage = parseInt(timeOnPage, 10);

      const referrer = request.get('Referer');
      if (referrer) metrics.referrer = referrer;

      // Only return metrics if we have meaningful data
      if (Object.keys(metrics).length > 2) {
        return {
          requestFrequency: 0, // Will be calculated by the service
          sequentialRequests: 0, // Will be calculated by the service
          mouseMovements: metrics.mouseMovements || 0,
          keyboardEvents: metrics.keyboardEvents || 0,
          scrollEvents: metrics.scrollEvents || 0,
          clickEvents: metrics.clickEvents || 0,
          sessionDuration: metrics.sessionDuration || 0,
          pageViews: metrics.pageViews || 0,
          timeOnPage: metrics.timeOnPage || 0,
          referrer: metrics.referrer,
        };
      }
    } catch (error) {
      this.logger.debug('Failed to extract behavior metrics:', error);
    }

    return undefined;
  }
}

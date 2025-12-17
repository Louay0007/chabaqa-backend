import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IPReputationService } from '../services/ip-reputation.service';
import { SecurityService } from '../services/security.service';

/**
 * Decorator to skip IP reputation check for specific endpoints
 */
export const SkipIPReputationCheck = () => 
  Reflect.metadata('skipIPReputationCheck', true);

/**
 * Decorator to set custom risk threshold for endpoints
 */
export const IPReputationThreshold = (threshold: number) =>
  Reflect.metadata('ipReputationThreshold', threshold);

@Injectable()
export class IPReputationGuard implements CanActivate {
  private readonly logger = new Logger(IPReputationGuard.name);

  constructor(
    private ipReputationService: IPReputationService,
    private securityService: SecurityService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if IP reputation check should be skipped
    const skipCheck = this.reflector.getAllAndOverride<boolean>('skipIPReputationCheck', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true;
    }

    // Get client IP
    const clientIP = this.getClientIP(request);
    const userAgent = request.get('User-Agent') || '';

    try {
      // Check if IP is temporarily blocked
      const isTemporarilyBlocked = await this.ipReputationService.isIPTemporarilyBlocked(clientIP);
      if (isTemporarilyBlocked) {
        this.handleBlockedRequest(request, response, clientIP, 'temporarily_blocked');
        return false;
      }

      // Perform reputation check
      const reputationResult = await this.ipReputationService.checkIPReputation(clientIP, userAgent);

      // Get custom threshold or use default
      const customThreshold = this.reflector.getAllAndOverride<number>('ipReputationThreshold', [
        context.getHandler(),
        context.getClass(),
      ]);

      const threshold = customThreshold ?? 70;

      // Block if IP is flagged as malicious or exceeds risk threshold
      if (reputationResult.isBlocked || reputationResult.riskScore > threshold) {
        this.handleBlockedRequest(request, response, clientIP, 'reputation_check', reputationResult);
        return false;
      }

      // Add reputation info to request for logging/monitoring
      request.ipReputation = reputationResult;

      // Log high-risk but allowed requests
      if (reputationResult.riskScore > 50) {
        this.securityService.logSecurityEvent(
          'HIGH_RISK_IP_ALLOWED',
          {
            ip: clientIP,
            userAgent,
            riskScore: reputationResult.riskScore,
            source: reputationResult.source,
            country: reputationResult.country,
            url: request.url,
            method: request.method,
          },
          'warn'
        );
      }

      return true;
    } catch (error) {
      this.logger.error(`IP reputation check failed for ${clientIP}:`, error);
      
      // In case of error, allow request but log the incident
      this.securityService.logSecurityEvent(
        'IP_REPUTATION_CHECK_ERROR',
        {
          ip: clientIP,
          userAgent,
          url: request.url,
          error: error.message,
        },
        'error'
      );

      return true; // Fail-open approach
    }
  }

  private handleBlockedRequest(
    request: any,
    response: any,
    clientIP: string,
    reason: string,
    reputationResult?: any
  ): void {
    // Set security headers
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');

    // Log the blocked request
    this.securityService.logSecurityEvent(
      'MALICIOUS_IP_REQUEST_BLOCKED',
      {
        ip: clientIP,
        userAgent: request.get('User-Agent'),
        url: request.url,
        method: request.method,
        headers: {
          'X-Forwarded-For': request.get('X-Forwarded-For'),
          'X-Real-IP': request.get('X-Real-IP'),
          'Referer': request.get('Referer'),
          'Origin': request.get('Origin'),
        },
        reason,
        reputationResult,
        timestamp: new Date().toISOString(),
      },
      'warn'
    );

    // Increment failed attempts counter
    this.incrementFailedAttempts(clientIP);

    // Throw HTTP exception
    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Access denied',
        error: 'IP_REPUTATION_BLOCKED',
        timestamp: new Date().toISOString(),
      },
      HttpStatus.FORBIDDEN
    );
  }

  private getClientIP(request: any): string {
    // Check X-Forwarded-For header (behind proxy/load balancer)
    const forwarded = request.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP header (Nginx proxy)
    const realIP = request.get('X-Real-IP');
    if (realIP) {
      return realIP;
    }

    // Check CF-Connecting-IP header (Cloudflare)
    const cfIP = request.get('CF-Connecting-IP');
    if (cfIP) {
      return cfIP;
    }

    // Check True-Client-IP header (Akamai, Cloudflare)
    const trueClientIP = request.get('True-Client-IP');
    if (trueClientIP) {
      return trueClientIP;
    }

    // Fallback to connection remote address
    return request.connection?.remoteAddress || 
           request.socket?.remoteAddress || 
           request.ip || 
           'unknown';
  }

  private async incrementFailedAttempts(ip: string): Promise<void> {
    try {
      // This would typically use Redis or a database
      // For now, we'll use the cache service
      const cacheKey = `failed_attempts:${ip}`;
      const currentAttempts = await this.ipReputationService['cacheService'].get<number>(cacheKey) || 0;
      const newAttempts = currentAttempts + 1;
      
      // Cache for 1 hour
      await this.ipReputationService['cacheService'].set(cacheKey, newAttempts, 3600);

      // Auto-block IP after 10 failed attempts
      if (newAttempts >= 10) {
        await this.ipReputationService.blockIPTemporarily(
          ip, 
          `Too many failed attempts: ${newAttempts}`, 
          60 // 1 hour block
        );
      }
    } catch (error) {
      this.logger.error(`Error incrementing failed attempts for ${ip}:`, error);
    }
  }
}

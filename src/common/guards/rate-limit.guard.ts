import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SecurityService } from '../services/security.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private securityService: SecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // For now, delegate to basic throttling - in production you'd configure more granular rules
    // The ThrottlerModule handles the actual rate limiting
    return true;
  }

  // Helper method to manually check rate limits if needed
  async checkRateLimit(
    context: ExecutionContext,
    limit: number = 100,
    ttl: number = 60000
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = this.getClientIP(request);

    // In a real implementation, you'd have a storage mechanism (Redis, etc.)
    // For now, this is a basic implementation
    this.logger.debug(`Rate limit check for IP: ${ip}`);

    // Log rate limit warnings
    this.securityService.logSecurityEvent(
      'RATE_LIMIT_CHECK',
      {
        ip,
        userAgent: request.get('User-Agent'),
        url: request.url,
        method: request.method,
        limit,
        ttl,
      },
      'info'
    );

    return true; // Allow by default - ThrottlerModule handles actual limiting
  }

  private getClientIP(request: any): string {
    // Check X-Forwarded-For header (behind proxy)
    const forwarded = request.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP header
    const realIP = request.get('X-Real-IP');
    if (realIP) {
      return realIP;
    }

    // Fallback to connection remote address
    return request.connection?.remoteAddress || request.socket?.remoteAddress || 'unknown';
  }

  private getRetryAfter(response: any): number {
    // Extract retry-after header if available
    const retryAfter = response.get('Retry-After');
    return retryAfter ? parseInt(retryAfter) : 60; // Default 60 seconds
  }
}

import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { AdminRateLimitException } from '../exceptions/admin-exceptions';

/**
 * Admin Rate Limit Guard
 * Extends ThrottlerGuard to provide custom rate limiting for admin endpoints
 * with enhanced error messages and logging
 * 
 * Validates: Requirements 8.6
 */
@Injectable()
export class AdminRateLimitGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AdminRateLimitGuard.name);

  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const { limit, ttl } = this.getThrottlerOptions(context);

    // Log rate limit violation
    this.logger.warn(
      `Rate limit exceeded for admin endpoint: ${request.method} ${request.url}`,
      {
        ip: request.ip,
        user: request.user?.id,
        limit,
        ttl,
      }
    );

    // Throw custom admin rate limit exception
    throw new AdminRateLimitException(limit, ttl);
  }

  /**
   * Get throttler options from context
   */
  private getThrottlerOptions(context: ExecutionContext): { limit: number; ttl: number } {
    // Default values - these will be overridden by module configuration
    return {
      limit: 100,
      ttl: 60,
    };
  }

  /**
   * Override to add custom tracking logic
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track by user ID if authenticated, otherwise by IP
    if (req.user?.id) {
      return `admin-user-${req.user.id}`;
    }
    return `admin-ip-${req.ip}`;
  }

  /**
   * Override to skip rate limiting for certain conditions
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Skip rate limiting for health check endpoints
    if (request.url.includes('/health')) {
      return true;
    }

    // IMPORTANT: Only apply rate limiting to admin endpoints
    // Skip all non-admin routes
    if (!request.url.startsWith('/api/admin')) {
      return true;
    }

    // Skip rate limiting for super admins (optional - can be configured)
    if (request.user?.isSuperAdmin) {
      return false; // Set to true to skip for super admins
    }

    return false;
  }
}

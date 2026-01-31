import { SetMetadata } from '@nestjs/common';

/**
 * Rate Limit Configuration Interface
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed
   */
  limit: number;

  /**
   * Time window in seconds
   */
  ttl: number;

  /**
   * Custom error message
   */
  message?: string;
}

/**
 * Metadata key for rate limit configuration
 */
export const RATE_LIMIT_KEY = 'admin_rate_limit';

/**
 * Admin Rate Limit Decorator
 * Apply custom rate limiting to specific admin endpoints
 * 
 * @param config Rate limit configuration
 * 
 * @example
 * ```typescript
 * @AdminRateLimit({ limit: 10, ttl: 60 })
 * @Post('bulk-operation')
 * async bulkOperation() {
 *   // This endpoint allows 10 requests per 60 seconds
 * }
 * ```
 * 
 * Validates: Requirements 8.6
 */
export const AdminRateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

/**
 * Predefined rate limit configurations for common scenarios
 */
export const RateLimitPresets = {
  /**
   * Standard rate limit for most admin operations
   * 100 requests per minute
   */
  STANDARD: { limit: 100, ttl: 60 },

  /**
   * Strict rate limit for sensitive operations
   * 20 requests per minute
   */
  STRICT: { limit: 20, ttl: 60 },

  /**
   * Relaxed rate limit for read operations
   * 200 requests per minute
   */
  RELAXED: { limit: 200, ttl: 60 },

  /**
   * Very strict rate limit for bulk operations
   * 5 requests per minute
   */
  BULK_OPERATIONS: { limit: 5, ttl: 60 },

  /**
   * Rate limit for export operations
   * 10 requests per 5 minutes
   */
  EXPORT: { limit: 10, ttl: 300 },

  /**
   * Rate limit for authentication operations
   * 5 requests per 15 minutes
   */
  AUTH: { limit: 5, ttl: 900 },
};

/**
 * Convenience decorators for common rate limit scenarios
 */

/**
 * Apply standard rate limit (100 req/min)
 */
export const StandardRateLimit = () => AdminRateLimit(RateLimitPresets.STANDARD);

/**
 * Apply strict rate limit (20 req/min)
 */
export const StrictRateLimit = () => AdminRateLimit(RateLimitPresets.STRICT);

/**
 * Apply relaxed rate limit (200 req/min)
 */
export const RelaxedRateLimit = () => AdminRateLimit(RateLimitPresets.RELAXED);

/**
 * Apply bulk operations rate limit (5 req/min)
 */
export const BulkOperationsRateLimit = () => AdminRateLimit(RateLimitPresets.BULK_OPERATIONS);

/**
 * Apply export rate limit (10 req/5min)
 */
export const ExportRateLimit = () => AdminRateLimit(RateLimitPresets.EXPORT);

/**
 * Apply auth rate limit (5 req/15min)
 */
export const AuthRateLimit = () => AdminRateLimit(RateLimitPresets.AUTH);

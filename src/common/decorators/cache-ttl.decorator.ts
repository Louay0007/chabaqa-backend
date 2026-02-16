import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl';
export const CACHE_KEY_PREFIX = 'cache_key_prefix';

/**
 * Set custom TTL for cached endpoint
 * @param ttl Time to live in seconds
 */
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_KEY, ttl);

/**
 * Set custom cache key prefix
 * @param prefix Cache key prefix
 */
export const CacheKeyPrefix = (prefix: string) => SetMetadata(CACHE_KEY_PREFIX, prefix);

/**
 * Predefined cache TTL values
 */
export const CacheDuration = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
  SIX_HOURS: 21600,
  ONE_DAY: 86400,
};

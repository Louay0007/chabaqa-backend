import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(`Cache set: ${key}`);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      // Don't throw error to avoid breaking the application
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value !== null && value !== undefined) {
        this.logger.debug(`Cache hit: ${key}`);
        return value;
      } else {
        this.logger.debug(`Cache miss: ${key}`);
        return undefined;
      }
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache (Note: This may not be supported by all cache stores)
   */
  async clear(): Promise<void> {
    try {
      // Cache clearing depends on the underlying store (Redis, Memory, etc.)
      // Some stores may not support reset operation
      this.logger.warn('Cache clear operation not implemented - depends on cache store');
    } catch (error) {
      this.logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get or set cache with a function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      const value = await this.cacheManager.get(key);
      return value !== null && value !== undefined;
    } catch (error) {
      this.logger.error(`Cache has error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   */
  async increment(key: string, amount = 1): Promise<number | undefined> {
    try {
      const current = (await this.get<number>(key)) || 0;
      const newValue = current + amount;
      await this.set(key, newValue);
      return newValue;
    } catch (error) {
      this.logger.error(`Cache increment error for key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Decrement a numeric value in cache
   */
  async decrement(key: string, amount = 1): Promise<number | undefined> {
    return this.increment(key, -amount);
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = keyValuePairs.map(({ key, value, ttl }) =>
      this.set(key, value, ttl)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    const promises = keys.map(key => this.get<T>(key));
    return Promise.all(promises);
  }

  /**
   * Create a namespaced key prefix
   */
  prefix(prefix: string): (key: string) => string {
    return (key: string) => `${prefix}:${key}`;
  }

  /**
   * Create a user-specific cache key
   */
  userKey(userId: string | number, key: string): string {
    return `user:${userId}:${key}`;
  }

  /**
   * Create a session cache key
   */
  sessionKey(sessionId: string, key: string): string {
    return `session:${sessionId}:${key}`;
  }

  /**
   * Create an API response cache key
   */
  apiKey(endpoint: string, params: Record<string, any> = {}): string {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    return `api:${endpoint}:${paramString ? `?${paramString}` : ''}`;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    // This would depend on the underlying cache store
    // For Redis, we could get more detailed stats
    try {
      return {
        isConnected: true,
        lastAccessed: new Date(),
      };
    } catch (error) {
      return {
        isConnected: false,
        error: error.message,
      };
    }
  }
}

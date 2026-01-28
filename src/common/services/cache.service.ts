import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly isRedisEnabled: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.isRedisEnabled = this.configService.get<string>('REDIS_ENABLED') === 'true';
  }

  /**
   * Check if Redis is being used
   */
  isUsingRedis(): boolean {
    return this.isRedisEnabled;
  }

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
   * Clear all cache
   * Works with both Redis and in-memory cache
   */
  async clear(): Promise<void> {
    try {
      if (this.isRedisEnabled) {
        // For Redis, use the store's reset method or flush
        const store = (this.cacheManager as any).store;
        if (store && typeof store.reset === 'function') {
          await store.reset();
          this.logger.log('Redis cache cleared successfully');
        } else if (store && store.getClient) {
          const client = store.getClient();
          if (client && typeof client.flushDb === 'function') {
            await client.flushDb();
            this.logger.log('Redis database flushed successfully');
          }
        }
      } else {
        // For in-memory cache, use reset if available
        const store = (this.cacheManager as any).store;
        if (store && typeof store.reset === 'function') {
          await store.reset();
          this.logger.log('In-memory cache cleared successfully');
        }
      }
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
   * Delete keys matching a pattern (Redis only)
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isRedisEnabled) {
      this.logger.warn('Pattern deletion is only supported with Redis');
      return 0;
    }

    try {
      const store = (this.cacheManager as any).store;
      if (store && store.getClient) {
        const client = store.getClient();
        if (client && typeof client.keys === 'function') {
          const keys = await client.keys(pattern);
          if (keys.length > 0) {
            await Promise.all(keys.map(key => this.delete(key)));
            this.logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
            return keys.length;
          }
        }
      }
      return 0;
    } catch (error) {
      this.logger.error(`Error deleting pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    try {
      const stats: any = {
        isConnected: true,
        lastAccessed: new Date(),
        type: this.isRedisEnabled ? 'redis' : 'memory',
      };

      if (this.isRedisEnabled) {
        const store = (this.cacheManager as any).store;
        if (store && store.getClient) {
          const client = store.getClient();
          if (client && typeof client.info === 'function') {
            try {
              const info = await client.info('memory');
              stats.redisInfo = info;
            } catch {
              // Redis info not available
            }
          }
          if (client && typeof client.dbSize === 'function') {
            try {
              stats.keyCount = await client.dbSize();
            } catch {
              // DB size not available
            }
          }
        }
      }

      return stats;
    } catch (error) {
      return {
        isConnected: false,
        error: error.message,
        type: this.isRedisEnabled ? 'redis' : 'memory',
      };
    }
  }
}

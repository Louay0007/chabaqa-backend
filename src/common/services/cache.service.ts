import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { RedisClientType, createClient } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly isRedisEnabled: boolean;
  private readonly defaultTtlSeconds: number;
  private redisClient: RedisClientType | null = null;
  private redisConnectPromise: Promise<void> | null = null;
  private lastRedisErrorMsg = '';
  private lastRedisErrorTs = 0;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.isRedisEnabled = String(this.configService.get<string>('REDIS_ENABLED') || '').toLowerCase() === 'true';
    this.defaultTtlSeconds = this.configService.get<number>('REDIS_TTL', 300);

    if (this.isRedisEnabled) {
      const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD', '');
      const db = this.configService.get<number>('REDIS_DB', 0);

      this.redisClient = createClient({
        socket: {
          host,
          port,
          reconnectStrategy: (retries: number) => {
            // Exponential backoff: 500ms, 1s, 2s, 4s … capped at 30s
            const delay = Math.min(500 * Math.pow(2, retries), 30_000);
            this.logger.warn(
              `Redis reconnect attempt ${retries + 1} in ${delay}ms`,
            );
            return delay;
          },
        },
        password: password || undefined,
        database: db,
      });

      this.redisClient.on('error', (error) => {
        // Throttle identical error logs to once per 30 seconds
        const msg = error?.message || String(error);
        const now = Date.now();
        if (msg !== this.lastRedisErrorMsg || now - this.lastRedisErrorTs > 30_000) {
          this.logger.error(`Redis client error: ${msg}`);
          this.lastRedisErrorMsg = msg;
          this.lastRedisErrorTs = now;
        }
      });

      this.redisConnectPromise = this.redisClient.connect()
        .then(() => {
          this.logger.log(`Redis client connected to ${host}:${port} (db=${db})`);
        })
        .catch((error) => {
          this.logger.error('Failed to connect Redis client:', error);
          this.redisConnectPromise = null;
        });
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.isRedisEnabled) {
      return;
    }

    const isProduction = String(this.configService.get<string>('NODE_ENV') || '').toLowerCase() === 'production';
    const connected = await this.ensureRedisConnected();

    if (!connected && isProduction) {
      this.logger.error(
        'Redis is enabled but unreachable in production. Refusing to boot to prevent cache drift and perf regression.',
      );
      throw new Error('REDIS_ENABLED=true but Redis is unreachable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit().catch(() => undefined);
    }
  }

  private async ensureRedisConnected(): Promise<boolean> {
    if (!this.isRedisEnabled || !this.redisClient) return false;

    if (this.redisClient.isOpen) return true;

    if (this.redisConnectPromise) {
      await this.redisConnectPromise;
      return this.redisClient.isOpen;
    }

    this.redisConnectPromise = this.redisClient.connect()
      .then(() => {
        this.redisConnectPromise = null;
      })
      .catch((error) => {
        this.logger.error('Failed to reconnect Redis client:', error);
        this.redisConnectPromise = null;
      });

    await this.redisConnectPromise;
    return this.redisClient.isOpen;
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
      if (await this.ensureRedisConnected()) {
        const ttlSeconds = Math.max(1, Math.floor(ttl ?? this.defaultTtlSeconds));
        await this.redisClient!.set(key, JSON.stringify(value), { EX: ttlSeconds });
        this.logger.debug(`Cache set: ${key}`);
        return;
      }

      // Fallback to in-memory cache-manager if Redis is unavailable.
      const ttlMs = typeof ttl === 'number'
        ? Math.max(1, Math.floor(ttl * 1000))
        : Math.max(1, Math.floor(this.defaultTtlSeconds * 1000));
      await this.cacheManager.set(key, value, ttlMs as any);
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
      if (await this.ensureRedisConnected()) {
        const raw = await this.redisClient!.get(key);
        if (raw === null) {
          this.logger.debug(`Cache miss: ${key}`);
          return undefined;
        }

        try {
          const value = JSON.parse(raw) as T;
          this.logger.debug(`Cache hit: ${key}`);
          return value;
        } catch {
          // Backward compatibility if any non-JSON values exist.
          this.logger.debug(`Cache hit: ${key}`);
          return raw as unknown as T;
        }
      }

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
      if (await this.ensureRedisConnected()) {
        await this.redisClient!.del(key);
        this.logger.debug(`Cache deleted: ${key}`);
        return;
      }

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
      if (await this.ensureRedisConnected()) {
        await this.redisClient!.flushDb();
        this.logger.log('Redis database flushed successfully');
        return;
      }

      // For in-memory cache, use reset if available
      const store = (this.cacheManager as any).store;
      if (store && typeof store.reset === 'function') {
        await store.reset();
        this.logger.log('In-memory cache cleared successfully');
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
      if (await this.ensureRedisConnected()) {
        const exists = await this.redisClient!.exists(key);
        return exists === 1;
      }

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
   * Increment with a fixed TTL (best-effort).
   * - Redis: atomic INCRBY + set EXPIRE only if the key is new.
   * - Memory fallback: get+set (TTL may behave like a sliding window).
   */
  async incrementWithTtl(key: string, amount = 1, ttlSeconds?: number): Promise<number | undefined> {
    const ttl = Math.max(1, Math.floor(ttlSeconds ?? this.defaultTtlSeconds));
    try {
      if (await this.ensureRedisConnected()) {
        const script =
          "local v = redis.call('INCRBY', KEYS[1], ARGV[1]); if v == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], ARGV[2]); end; return v;";
        const result = await this.redisClient!.eval(script, {
          keys: [key],
          arguments: [String(amount), String(ttl)],
        });

        if (typeof result === 'number') return result;
        const parsed = Number(result);
        return Number.isFinite(parsed) ? parsed : undefined;
      }

      const current = (await this.get<number>(key)) || 0;
      const newValue = current + amount;
      await this.set(key, newValue, ttl);
      return newValue;
    } catch (error) {
      this.logger.error(`Cache incrementWithTtl error for key ${key}:`, error);
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
      if (await this.ensureRedisConnected()) {
        let cursor = 0;
        let deleted = 0;

        do {
          const result = await this.redisClient!.scan(cursor, {
            MATCH: pattern,
            COUNT: 500,
          });

          cursor = result.cursor;
          const keys = result.keys;
          if (keys.length > 0) {
            deleted += await this.redisClient!.del(keys);
          }
        } while (cursor !== 0);

        if (deleted > 0) {
          this.logger.debug(`Deleted ${deleted} keys matching pattern: ${pattern}`);
        }
        return deleted;
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

      if (await this.ensureRedisConnected()) {
        try {
          stats.redisInfo = await this.redisClient!.info('memory');
        } catch {
          // Redis info not available
        }

        try {
          stats.keyCount = await this.redisClient!.dbSize();
        } catch {
          // DB size not available
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

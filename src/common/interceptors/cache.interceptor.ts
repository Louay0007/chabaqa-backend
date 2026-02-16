import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../services/cache.service';

/**
 * HTTP Cache Interceptor
 * Caches GET requests in Redis for faster response times
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpCacheInterceptor.name);

  constructor(private cacheService: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Skip caching for authenticated user-specific endpoints
    const skipPatterns = [
      '/my',
      '/me',
      '/notifications',
      '/messages',
      '/dm/',
      '/wallet',
      '/admin/',
    ];

    if (skipPatterns.some(pattern => url.includes(pattern))) {
      return next.handle();
    }

    // Create cache key
    const cacheKey = this.getCacheKey(url, user);

    // Try to get from cache
    const cachedResponse = await this.cacheService.get(cacheKey);
    if (cachedResponse) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return of(cachedResponse);
    }

    this.logger.debug(`Cache MISS: ${cacheKey}`);

    // If not in cache, execute request and cache the result
    return next.handle().pipe(
      tap(async (response) => {
        // Determine TTL based on endpoint
        const ttl = this.getTTL(url);
        await this.cacheService.set(cacheKey, response, ttl);
        this.logger.debug(`Cached response for ${cacheKey} (TTL: ${ttl}s)`);
      }),
    );
  }

  private getCacheKey(url: string, user?: any): string {
    // Remove query parameters for consistent caching
    const baseUrl = url.split('?')[0];
    return `http:${baseUrl}`;
  }

  private getTTL(url: string): number {
    // Static content - 1 hour
    if (url.includes('/communities') || url.includes('/explore')) {
      return 3600; // 1 hour
    }

    // Feedback/ratings - 5 minutes
    if (url.includes('/feedback') || url.includes('/stats')) {
      return 300; // 5 minutes
    }

    // Courses/content - 15 minutes
    if (url.includes('/cours') || url.includes('/products') || url.includes('/events')) {
      return 900; // 15 minutes
    }

    // Posts - 2 minutes
    if (url.includes('/posts')) {
      return 120; // 2 minutes
    }

    // Default - 5 minutes
    return 300;
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../services/cache.service';
import { CACHE_KEY_PREFIX, CACHE_TTL_KEY } from '../decorators/cache-ttl.decorator';

/**
 * HTTP Cache Interceptor
 * Caches GET requests in Redis/in-memory for faster response times.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpCacheInterceptor.name);

  constructor(
    private cacheService: CacheService,
    private reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, user } = request;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Skip caching for authenticated/user-scoped or highly dynamic endpoints
    const skipPatterns = [
      '/my',
      '/me',
      '/notifications',
      '/messages',
      '/dm/',
      '/wallet',
      '/admin/',
      '/auth/',
    ];

    if (skipPatterns.some((pattern) => String(url).includes(pattern))) {
      return next.handle();
    }

    const userId = this.extractUserId(user);
    const hasAuthHeader = Boolean(request?.headers?.authorization);
    // Guard against accidental cache sharing for authenticated requests
    // where user payload cannot be resolved.
    if (hasAuthHeader && !userId) {
      this.logger.debug(`Cache BYPASS: unresolved authenticated user for url=${url}`);
      return next.handle();
    }

    const customKeyPrefix = this.reflector.getAllAndOverride<string>(
      CACHE_KEY_PREFIX,
      [context.getHandler(), context.getClass()],
    );
    const customTtl = this.reflector.getAllAndOverride<number>(
      CACHE_TTL_KEY,
      [context.getHandler(), context.getClass()],
    );

    const cacheKey = this.getCacheKey(url, request, userId, customKeyPrefix);

    const cachedResponse = await this.cacheService.get(cacheKey);
    if (cachedResponse !== undefined) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return of(cachedResponse);
    }

    this.logger.debug(`Cache MISS: ${cacheKey}`);

    return next.handle().pipe(
      tap(async (payload) => {
        // Do not cache failed HTTP responses.
        if (typeof response?.statusCode === 'number' && response.statusCode >= 400) {
          return;
        }

        // Do not cache obvious error-like payloads.
        if (
          payload?.error ||
          payload?.errors ||
          payload?.exception ||
          payload?.success === false ||
          payload?.ok === false ||
          payload?.statusCode >= 400
        ) {
          return;
        }

        const ttl = customTtl ?? this.getTTL(String(url));
        await this.cacheService.set(cacheKey, payload, ttl);
        this.logger.debug(`Cached response for ${cacheKey} (TTL: ${ttl}s)`);
      }),
    );
  }

  private getCacheKey(
    url: string,
    request: any,
    userId?: string,
    customPrefix?: string,
  ): string {
    const [path, queryString] = String(url).split('?');
    const query = new URLSearchParams(queryString || '');

    const normalizedQuery = [...query.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const prefix = customPrefix || 'http';
    const queryPart = normalizedQuery ? `?${normalizedQuery}` : '';
    const userPart = userId ? `:u:${userId}` : '';
    const lang = request?.headers?.['accept-language']
      ? `:lang:${String(request.headers['accept-language'])}`
      : '';

    return `${prefix}:${path}${queryPart}${userPart}${lang}`;
  }

  private extractUserId(user?: any): string | undefined {
    const raw = user?._id ?? user?.id ?? user?.sub ?? user?.userId;
    if (!raw) return undefined;
    const normalized = String(raw).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private getTTL(url: string): number {
    // Membership/progress checks directly impact protected dashboard experience.
    if (
      url.includes('/membership') ||
      url.includes('/joined') ||
      url.includes('/my-created') ||
      url.includes('/my-joined') ||
      url.includes('/my-manageable')
    ) {
      return 45; // 30-60s class
    }

    // User-scoped dashboard-style endpoints should refresh quickly.
    if (
      url.includes('/user/') ||
      url.includes('/by-user/') ||
      url.includes('/bookings/user') ||
      url.includes('/bookings/creator')
    ) {
      return 60; // 1 minute
    }

    // Creator analytics should be fast but fresh.
    if (url.includes('/analytics/creator')) {
      return 90; // 1.5 minutes
    }

    // More static listing/explore endpoints
    if (url.includes('/communities') || url.includes('/explore')) {
      return 900; // 15 minutes
    }

    // Aggregate/statistics endpoints
    if (url.includes('/feedback') || url.includes('/stats') || url.includes('/analytics')) {
      return 300; // 5 minutes
    }

    // Catalog/content pages
    if (url.includes('/cours') || url.includes('/products')) {
      return 900; // 15 minutes
    }

    // Events mutate frequently via publish/manage actions; keep cache short.
    if (url.includes('/events')) {
      return 120; // 2 minutes
    }

    // Feed-like endpoints
    if (url.includes('/posts')) {
      return 120; // 2 minutes
    }

    return 300; // default 5 minutes
  }
}

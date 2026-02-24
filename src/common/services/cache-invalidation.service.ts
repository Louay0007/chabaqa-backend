import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Cache Invalidation Service
 * Handles cache invalidation when data is modified
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private cacheService: CacheService) {}

  /**
   * Invalidate feedback cache for a specific item
   */
  async invalidateFeedback(relatedModel: string, relatedTo: string): Promise<void> {
    const patterns = [
      `http:/api/feedback/${relatedModel}/${relatedTo}*`,
      `http:/api/communities*`, // Invalidate communities list as ratings changed
      `http:/api/sessions*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
      this.logger.debug(`Invalidated cache pattern: ${pattern}`);
    }
  }

  /**
   * Invalidate community cache
   */
  async invalidateCommunity(communityId: string): Promise<void> {
    const patterns = [
      `http:/api/communities*`,
      `http:/api/community-aff-crea-join/${communityId}*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated community cache: ${communityId}`);
  }

  /**
   * Invalidate course cache
   */
  async invalidateCourse(courseId: string): Promise<void> {
    const patterns = [
      `http:/api/cours/${courseId}*`,
      `http:/api/cours*`,
      `http:/api/communities*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated course cache: ${courseId}`);
  }

  /**
   * Invalidate product cache
   */
  async invalidateProduct(productId: string): Promise<void> {
    const patterns = [
      `http:/api/products/${productId}*`,
      `http:/api/products*`,
      `http:/api/communities*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated product cache: ${productId}`);
  }

  /**
   * Invalidate event cache
   */
  async invalidateEvent(eventId: string): Promise<void> {
    const patterns = [
      `http:/api/events/${eventId}*`,
      `http:/api/events*`,
      `http:/api/communities*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated event cache: ${eventId}`);
  }

  /**
   * Invalidate challenge cache
   */
  async invalidateChallenge(challengeId: string): Promise<void> {
    const patterns = [
      `http:/api/challenges/${challengeId}*`,
      `http:/api/challenges*`,
      `http:/api/communities*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated challenge cache: ${challengeId}`);
  }

  /**
   * Invalidate post cache
   */
  async invalidatePost(postId: string, communityId?: string): Promise<void> {
    const patterns = [
      `http:/api/posts/${postId}*`,
      `http:/api/posts*`,
    ];

    if (communityId) {
      patterns.push(`http:/api/communities/${communityId}*`);
    }

    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
    this.logger.debug(`Invalidated post cache: ${postId}`);
  }

  /**
   * Clear all HTTP cache
   */
  async clearAllHttpCache(): Promise<void> {
    await this.cacheService.deletePattern('http:*');
    this.logger.log('Cleared all HTTP cache');
  }
}

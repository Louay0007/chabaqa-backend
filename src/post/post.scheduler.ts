import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostService } from './post.service';

/**
 * Scheduled job that fires every minute and publishes any posts whose
 * scheduledAt time has passed.
 */
@Injectable()
export class PostScheduler {
  private readonly logger = new Logger(PostScheduler.name);

  constructor(private readonly postService: PostService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPosts(): Promise<void> {
    this.logger.debug('Checking for scheduled posts to publish...');
    try {
      await this.postService.publishDuePosts();
    } catch (error) {
      this.logger.error('Error publishing scheduled posts', error);
    }
  }
}

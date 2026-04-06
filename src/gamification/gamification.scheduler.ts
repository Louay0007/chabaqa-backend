import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GamificationService } from './gamification.service';

@Injectable()
export class GamificationScheduler {
  private readonly logger = new Logger(GamificationScheduler.name);

  constructor(private readonly gamificationService: GamificationService) {}

  // Reset weekly points every Monday at 07:00 UTC
  @Cron('0 7 * * 1')
  async handleWeeklyReset() {
    this.logger.log('Running weekly gamification points reset...');
    try {
      await this.gamificationService.resetWeeklyPoints();
      this.logger.log('Weekly reset completed successfully');
    } catch (error) {
      this.logger.error('Weekly reset failed:', error);
    }
  }
}

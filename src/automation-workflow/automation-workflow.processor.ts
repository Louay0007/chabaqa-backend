import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationWorkflowService } from './automation-workflow.service';

@Injectable()
export class AutomationWorkflowProcessor {
  private readonly logger = new Logger(AutomationWorkflowProcessor.name);

  constructor(private readonly workflowService: AutomationWorkflowService) {}

  /**
   * Every minute: find enrollments whose resumeAt has passed and execute the
   * next step for each of them.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async resumeWaitingEnrollments(): Promise<void> {
    try {
      await this.workflowService.resumeDueEnrollments();
    } catch (err: any) {
      this.logger.error(`resumeWaitingEnrollments cron failed: ${err?.message}`);
    }
  }

  /**
   * Daily at 08:00: find all INACTIVITY-triggered workflows and enroll
   * qualifying users (respects 30-day cooldown per user per workflow).
   */
  @Cron('0 8 * * *')
  async triggerDailyInactivityWorkflows(): Promise<void> {
    this.logger.log('Running daily inactivity workflow trigger...');
    try {
      await this.workflowService.triggerDailyInactivityWorkflows();
      this.logger.log('Daily inactivity workflow trigger completed');
    } catch (err: any) {
      this.logger.error(
        `triggerDailyInactivityWorkflows cron failed: ${err?.message}`,
      );
    }
  }
}

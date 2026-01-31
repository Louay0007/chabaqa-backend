import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsDashboardController } from './analytics-dashboard.controller';
import { AnalyticsDashboardService } from './analytics-dashboard.service';

/**
 * AnalyticsDashboardModule provides comprehensive analytics dashboard functionality
 * Handles platform statistics, engagement metrics, retention analysis, and alert management
 * 
 * Note: Common services (AnalyticsService, ExportService, AdminNotificationService) 
 * are provided by the parent AdminModule
 */
@Module({
  imports: [
    // Add any required schema imports here if needed
  ],
  controllers: [AnalyticsDashboardController],
  providers: [
    AnalyticsDashboardService,
  ],
  exports: [AnalyticsDashboardService]
})
export class AnalyticsDashboardModule {}

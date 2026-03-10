import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsDashboardController } from './analytics-dashboard.controller';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AdminAlertConfig, AdminAlertConfigSchema } from './schemas/admin-alert-config.schema';

/**
 * AnalyticsDashboardModule provides comprehensive analytics dashboard functionality
 * Handles platform statistics, engagement metrics, retention analysis, and alert management
 * 
 * Note: Common services (AnalyticsService, ExportService, AdminNotificationService) 
 * are provided by the parent AdminModule
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminAlertConfig.name, schema: AdminAlertConfigSchema },
    ]),
  ],
  controllers: [AnalyticsDashboardController],
  providers: [
    AnalyticsDashboardService,
  ],
  exports: [AnalyticsDashboardService]
})
export class AnalyticsDashboardModule {}

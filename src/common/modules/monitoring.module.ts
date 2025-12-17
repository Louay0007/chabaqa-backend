import { Module, Global } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MonitoringService } from '../services/monitoring.service';
import { HealthController } from '../controllers/health.controller';
import { MetricsController } from '../controllers/metrics.controller';

@Global()
@Module({
  imports: [
    TerminusModule.forRoot({
      errorLogStyle: 'pretty',
      gracefulShutdownTimeoutMs: 1000,
    }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}

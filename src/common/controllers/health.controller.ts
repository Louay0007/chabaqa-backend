import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { MonitoringService } from '../services/monitoring.service';

@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private monitoringService: MonitoringService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Comprehensive health check',
    description: 'Check the health status of all system components including database, application, and system resources'
  })
  @ApiResponse({
    status: 200,
    description: 'All services are healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        details: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'up' },
                connections: { type: 'object' },
                collections: { type: 'number' }
              }
            },
            system: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'up' },
                memory: { type: 'object' },
                cpu: { type: 'object' }
              }
            },
            application: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'up' },
                requestCount: { type: 'number' },
                errorCount: { type: 'number' }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 503, description: 'One or more services are unhealthy' })
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    const result = await this.health.check([
      () => this.monitoringService.getDatabaseHealth(),
      () => this.monitoringService.getSystemHealth(),
      () => this.monitoringService.getApplicationHealth(),
    ]);

    // Log health check result
    const hasIssues = Object.values(result.details).some(detail =>
      Object.values(detail).some((check: any) => check.status === 'down')
    );

    this.monitoringService.logApplicationEvent(
      'HEALTH_CHECK',
      { result, hasIssues },
      hasIssues ? 'warn' : 'info'
    );

    return result;
  }

  @Get('database')
  @ApiOperation({
    summary: 'Database health check',
    description: 'Check MongoDB connection and collection status'
  })
  @ApiResponse({ status: 200, description: 'Database is healthy' })
  @ApiResponse({ status: 503, description: 'Database is unhealthy' })
  @HealthCheck()
  async checkDatabase(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.monitoringService.getDatabaseHealth(),
    ]);
  }

  @Get('system')
  @ApiOperation({
    summary: 'System health check',
    description: 'Check system resources including CPU, memory, and uptime'
  })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  @ApiResponse({ status: 503, description: 'System is unhealthy' })
  @HealthCheck()
  async checkSystem(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.monitoringService.getSystemHealth(),
    ]);
  }

  @Get('application')
  @ApiOperation({
    summary: 'Application health check',
    description: 'Check application status including request count and error rates'
  })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  @HealthCheck()
  async checkApplication(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.monitoringService.getApplicationHealth(),
    ]);
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Simple ping check',
    description: 'Quick response check to verify the service is running'
  })
  @ApiResponse({
    status: 200,
    description: 'Service is running',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'pong' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number' }
      }
    }
  })
  ping() {
    return {
      message: 'pong',
      timestamp: new Date().toISOString(),
      uptime: this.monitoringService.getUptime(),
    };
  }
}

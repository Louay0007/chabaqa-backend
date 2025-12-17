import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from '../services/monitoring.service';

@ApiTags('Health & Monitoring')
@Controller('metrics')
export class MetricsController {
  constructor(private monitoringService: MonitoringService) {}

  @Get()
  @ApiOperation({
    summary: 'Get comprehensive application metrics',
    description: 'Retrieve detailed metrics about system performance, application health, and performance history'
  })
  @ApiResponse({
    status: 200,
    description: 'Metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        system: {
          type: 'object',
          properties: {
            rss: { type: 'number', description: 'RSS memory in bytes' },
            heapTotal: { type: 'number', description: 'Total heap in bytes' },
            heapUsed: { type: 'number', description: 'Used heap in bytes' },
            rssMB: { type: 'number', description: 'RSS memory in MB' },
            heapUsedMB: { type: 'number', description: 'Used heap in MB' }
          }
        },
        application: {
          type: 'object',
          properties: {
            uptime: { type: 'number', description: 'Application uptime in milliseconds' },
            requestCount: { type: 'number', description: 'Total request count' },
            errorCount: { type: 'number', description: 'Total error count' },
            errorRate: { type: 'number', description: 'Error rate as percentage' }
          }
        },
        database: {
          type: 'object',
          properties: {
            readyState: { type: 'number', description: 'MongoDB connection ready state' },
            host: { type: 'string', description: 'Database host' },
            port: { type: 'number', description: 'Database port' },
            name: { type: 'string', description: 'Database name' }
          }
        },
        performanceHistory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              memory: { type: 'object' },
              cpu: { type: 'object' },
              database: { type: 'object' }
            }
          }
        }
      }
    }
  })
  getMetrics() {
    return this.monitoringService.getMetrics();
  }

  @Get('system')
  @ApiOperation({
    summary: 'Get system resource metrics',
    description: 'Retrieve CPU, memory, and system resource information'
  })
  @ApiResponse({
    status: 200,
    description: 'System metrics retrieved successfully'
  })
  getSystemMetrics() {
    return {
      memory: this.monitoringService.getMemoryUsage(),
      cpu: this.monitoringService.getCPUUsage(),
      uptime: this.monitoringService.getUptime(),
    };
  }

  @Get('memory')
  @ApiOperation({
    summary: 'Get memory usage metrics',
    description: 'Detailed memory usage statistics for the Node.js process'
  })
  @ApiResponse({
    status: 200,
    description: 'Memory metrics retrieved successfully'
  })
  getMemoryMetrics() {
    return this.monitoringService.getMemoryUsage();
  }

  @Get('cpu')
  @ApiOperation({
    summary: 'Get CPU usage metrics',
    description: 'CPU usage statistics including core count and utilization'
  })
  @ApiResponse({
    status: 200,
    description: 'CPU metrics retrieved successfully'
  })
  getCpuMetrics() {
    return this.monitoringService.getCPUUsage();
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Get performance history',
    description: 'Historical performance data collected over time'
  })
  @ApiResponse({
    status: 200,
    description: 'Performance history retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          memory: { type: 'object' },
          cpu: { type: 'object' },
          database: { type: 'object' },
          requests: { type: 'number' },
          errors: { type: 'number' }
        }
      }
    }
  })
  getPerformanceHistory() {
    const metrics = this.monitoringService.getMetrics();
    return metrics.performanceHistory;
  }

  @Get('prometheus')
  @ApiOperation({
    summary: 'Get metrics in Prometheus format',
    description: 'Export metrics in Prometheus exposition format for external monitoring systems'
  })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics exported successfully',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example: '# HELP shabaka_request_total Total number of requests\n# TYPE shabaka_request_total counter\nshabaka_request_total 42\n'
        }
      }
    }
  })
  getPrometheusMetrics(): string {
    const metrics = this.monitoringService.getMetrics();

    let output = `# Shabaka Application Metrics\n`;

    // Application metrics
    output += `# HELP shabaka_request_total Total number of requests processed\n`;
    output += `# TYPE shabaka_request_total counter\n`;
    output += `shabaka_request_total ${metrics.application.requestCount}\n\n`;

    output += `# HELP shabaka_error_total Total number of errors\n`;
    output += `# TYPE shabaka_error_total counter\n`;
    output += `shabaka_error_total ${metrics.application.errorCount}\n\n`;

    output += `# HELP shabaka_error_rate Error rate as percentage\n`;
    output += `# TYPE shabaka_error_rate gauge\n`;
    output += `shabaka_error_rate ${metrics.application.errorRate}\n\n`;

    output += `# HELP shabaka_uptime_seconds Application uptime in seconds\n`;
    output += `# TYPE shabaka_uptime_seconds gauge\n`;
    output += `shabaka_uptime_seconds ${metrics.application.uptime / 1000}\n\n`;

    // Memory metrics
    output += `# HELP shabaka_memory_heap_used_bytes Memory heap used in bytes\n`;
    output += `# TYPE shabaka_memory_heap_used_bytes gauge\n`;
    output += `shabaka_memory_heap_used_bytes ${metrics.system.heapUsed}\n\n`;

    output += `# HELP shabaka_memory_rss_bytes Memory RSS in bytes\n`;
    output += `# TYPE shabaka_memory_rss_bytes gauge\n`;
    output += `shabaka_memory_rss_bytes ${metrics.system.rss}\n\n`;

    // CPU metrics (would need more complex calculation for accurate CPU monitoring)
    output += `# HELP shabaka_cpu_usage_percent CPU usage percentage\n`;
    output += `# TYPE shabaka_cpu_usage_percent gauge\n`;
    const cpuMetrics = this.monitoringService.getCPUUsage();
    output += `shabaka_cpu_usage_percent ${cpuMetrics.usage}\n\n`;

    return output;
  }
}

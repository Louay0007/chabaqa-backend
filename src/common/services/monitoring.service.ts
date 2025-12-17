import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as os from 'os';
import * as process from 'process';

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private metrics: Map<string, any> = new Map();
  private startTime: Date;
  private requestCount: number = 0;
  private errorCount: number = 0;
  private performanceMetrics: any[] = [];

  constructor(
    private health: HealthCheckService,
    @InjectConnection() private connection: Connection,
  ) {
    this.startTime = new Date();
  }

  async onModuleInit() {
    this.logger.log('Monitoring service initialized');

    // Initialize metrics collection
    this.initializeMetrics();

    // Set up periodic metrics collection
    this.startMetricsCollection();
  }

  async onModuleDestroy() {
    this.logger.log('Monitoring service shutting down');
  }

  private initializeMetrics() {
    this.metrics.set('uptime', () => this.getUptime());
    this.metrics.set('memory_usage', () => this.getMemoryUsage());
    this.metrics.set('cpu_usage', () => this.getCPUUsage());
    this.metrics.set('request_count', () => this.requestCount);
    this.metrics.set('error_count', () => this.errorCount);
    this.metrics.set('database_connections', () => this.getDatabaseConnections());
  }

  private startMetricsCollection() {
    // Collect metrics every 30 seconds
    setInterval(() => {
      try {
        this.collectPerformanceMetrics();
      } catch (error) {
        this.logger.error('Error collecting performance metrics:', error);
      }
    }, 30000);
  }

  private collectPerformanceMetrics() {
    const metrics = {
      timestamp: new Date(),
      memory: this.getMemoryUsage(),
      cpu: this.getCPUUsage(),
      uptime: this.getUptime(),
      requests: this.requestCount,
      errors: this.errorCount,
      database: {
        connections: this.getDatabaseConnections(),
        collections: this.connection.db?.collections ? Object.keys(this.connection.db.collections).length : 0,
      },
    };

    this.performanceMetrics.push(metrics);

    // Keep only last 100 entries to prevent memory leak
    if (this.performanceMetrics.length > 100) {
      this.performanceMetrics.shift();
    }
  }

  /**
   * Increment request count
   */
  incrementRequestCount() {
    this.requestCount++;
  }

  /**
   * Increment error count
   */
  incrementErrorCount() {
    this.errorCount++;
  }

  /**
   * Get system uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    };
  }

  /**
   * Get CPU usage
   */
  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;

    return {
      usage: Math.round((1 - idle / total) * 100),
      cores: cpus.length,
    };
  }

  /**
   * Get database connection status
   */
  async getDatabaseHealth(): Promise<HealthIndicatorResult> {
    try {
      if (this.connection.readyState === 1) { // Connected
        return {
          database: {
            status: 'up',
            connections: this.getDatabaseConnections(),
            collections: await this.getCollectionCount(),
          },
        };
      } else {
        return {
          database: {
            status: 'down',
            connections: this.getDatabaseConnections(),
            error: 'Database not connected',
          },
        };
      }
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return {
        database: {
          status: 'down',
          error: error.message,
        },
      };
    }
  }

  private getDatabaseConnections() {
    return {
      readyState: this.connection.readyState,
      host: this.connection.host,
      port: this.connection.port,
      name: this.connection.name,
    };
  }

  private async getCollectionCount(): Promise<number> {
    try {
      if (!this.connection || !this.connection.db) {
        this.logger.warn('Database connection is not available.');
        return 0;
      }
      const collections = await this.connection.db?.listCollections().toArray();
      return collections?.length ?? 0;
    } catch (error) {
      this.logger.error('Error getting collection count:', error);
      return 0;
    }
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<HealthIndicatorResult> {
    const memory = this.getMemoryUsage();
    const cpu = this.getCPUUsage();

    // Check if system is healthy based on thresholds
    const isHealthy = memory.heapUsedMB < 512 && cpu.usage < 90; // 512MB heap, 90% CPU

    return {
      system: {
        status: isHealthy ? 'up' : 'down',
        memory: memory,
        cpu: cpu,
        uptime: this.getUptime(),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };
  }

  /**
   * Get application health
   */
  async getApplicationHealth(): Promise<HealthIndicatorResult> {
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    // Consider unhealthy if error rate > 5%
    const isHealthy = errorRate < 5;

    return {
      application: {
        status: isHealthy ? 'up' : 'down',
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: `${errorRate.toFixed(2)}%`,
        startTime: this.startTime,
      },
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      system: this.getMemoryUsage(),
      application: {
        uptime: this.getUptime(),
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      },
      database: this.getDatabaseConnections(),
      performanceHistory: this.performanceMetrics.slice(-10), // Last 10 readings
    };
  }

  /**
   * Log application event
   */
  logApplicationEvent(event: string, details: any, level: 'info' | 'warn' | 'error' = 'info') {
    const logEntry = {
      timestamp: new Date(),
      event,
      details,
      level,
      metrics: this.getMetrics(),
    };

    switch (level) {
      case 'error':
        this.logger.error(`APPLICATION EVENT: ${event}`, logEntry);
        break;
      case 'warn':
        this.logger.warn(`APPLICATION EVENT: ${event}`, logEntry);
        break;
      default:
        this.logger.log(`APPLICATION EVENT: ${event}`, logEntry);
    }
  }
}

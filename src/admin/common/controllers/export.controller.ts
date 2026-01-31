import { 
  Controller, 
  Post, 
  Get, 
  Param, 
  Body, 
  UseGuards, 
  Req, 
  HttpStatus,
  HttpException,
  Query,
  Res
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody
} from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService, ExportConfig, ExportJob, ExportFormat, ExportType } from '../services/export.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { RequireAdminPermissions } from '../decorators/admin-roles.decorator';
import { AdminPermission } from '../../schemas/admin-user.schema';
import { AuditContext } from '../decorators/audit-context.decorator';
import { AdminAction } from '../../schemas/audit-log.schema';

/**
 * ExportController handles data export functionality for admin users
 * Provides endpoints for creating, tracking, and downloading export jobs
 */
@ApiTags('Admin - Data Export')
@ApiBearerAuth()
@Controller('admin/export')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * Create a new export job
   */
  @Post('jobs')
  @RequireAdminPermissions(AdminPermission.EXPORT_DATA)
  @AuditContext({ action: AdminAction.DATA_EXPORT, entityType: 'ExportJob' })
  @ApiOperation({
    summary: 'Create Export Job',
    description: 'Create a new data export job with specified type, format, and filters'
  })
  @ApiBody({
    description: 'Export job configuration',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: Object.values(ExportType) },
        format: { type: 'string', enum: Object.values(ExportFormat) },
        filters: { type: 'object' },
        fields: { type: 'array', items: { type: 'string' } }
      },
      required: ['type', 'format']
    },
    examples: {
      'User Export': {
        summary: 'Export users to CSV',
        value: {
          type: 'users',
          format: 'csv',
          filters: {
            status: ['active'],
            registrationDateRange: {
              startDate: '2024-01-01',
              endDate: '2024-12-31'
            }
          },
          fields: ['id', 'email', 'name', 'createdAt', 'status']
        }
      },
      'Analytics Export': {
        summary: 'Export analytics to Excel',
        value: {
          type: 'analytics',
          format: 'excel',
          filters: {
            period: {
              startDate: '2024-01-01',
              endDate: '2024-12-31'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Export job created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        format: { type: 'string' },
        status: { type: 'string' },
        progress: { type: 'number' },
        downloadUrl: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        errorMessage: { type: 'string' },
        fileSize: { type: 'number' },
        recordCount: { type: 'number' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid export configuration'
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions'
  })
  async createExportJob(
    @Body() createExportDto: {
      type: ExportType;
      format: ExportFormat;
      filters?: Record<string, any>;
      fields?: string[];
    },
    @Req() req: any
  ): Promise<{
    id: string;
    type: ExportType;
    format: ExportFormat;
    status: string;
    progress: number;
    downloadUrl?: string;
    createdAt: Date;
    completedAt?: Date;
    errorMessage?: string;
    fileSize?: number;
    recordCount?: number;
  }> {
    try {
      const adminUserId = req.user.sub || req.user._id || req.user.userId;
      
      const config: ExportConfig = {
        ...createExportDto,
        createdBy: adminUserId
      };

      const job = await this.exportService.createExportJob(config);
      
      return {
        id: job.id,
        type: job.type,
        format: job.format,
        status: job.status,
        progress: job.progress,
        downloadUrl: job.downloadUrl,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
        fileSize: job.fileSize,
        recordCount: job.recordCount
      };
    } catch (error) {
      throw new HttpException(
        `Failed to create export job: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get export job status
   */
  @Get('jobs/:jobId')
  @RequireAdminPermissions(AdminPermission.EXPORT_DATA)
  @ApiOperation({
    summary: 'Get Export Job Status',
    description: 'Get the current status and progress of an export job'
  })
  @ApiParam({
    name: 'jobId',
    description: 'Export job ID',
    example: 'export_1640995200000_abc123def'
  })
  @ApiResponse({
    status: 200,
    description: 'Export job status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        format: { type: 'string' },
        status: { type: 'string' },
        progress: { type: 'number' },
        downloadUrl: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        errorMessage: { type: 'string' },
        fileSize: { type: 'number' },
        recordCount: { type: 'number' }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Export job not found'
  })
  async getExportJobStatus(@Param('jobId') jobId: string): Promise<{
    id: string;
    type: ExportType;
    format: ExportFormat;
    status: string;
    progress: number;
    downloadUrl?: string;
    createdAt: Date;
    completedAt?: Date;
    errorMessage?: string;
    fileSize?: number;
    recordCount?: number;
  }> {
    const job = await this.exportService.getExportStatus(jobId);
    
    if (!job) {
      throw new HttpException('Export job not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: job.id,
      type: job.type,
      format: job.format,
      status: job.status,
      progress: job.progress,
      downloadUrl: job.downloadUrl,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      fileSize: job.fileSize,
      recordCount: job.recordCount
    };
  }

  /**
   * Download export file
   */
  @Get('jobs/:jobId/download')
  @RequireAdminPermissions(AdminPermission.EXPORT_DATA)
  @AuditContext({ action: AdminAction.DATA_EXPORT, entityType: 'ExportJob' })
  @ApiOperation({
    summary: 'Download Export File',
    description: 'Download the generated export file for a completed job'
  })
  @ApiParam({
    name: 'jobId',
    description: 'Export job ID',
    example: 'export_1640995200000_abc123def'
  })
  @ApiResponse({
    status: 200,
    description: 'Export file downloaded successfully',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Export job or file not found'
  })
  @ApiResponse({
    status: 400,
    description: 'Export job not completed'
  })
  async downloadExport(
    @Param('jobId') jobId: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const job = await this.exportService.getExportStatus(jobId);
      
      if (!job) {
        throw new HttpException('Export job not found', HttpStatus.NOT_FOUND);
      }

      if (job.status !== 'completed') {
        throw new HttpException(
          `Export job is not completed. Current status: ${job.status}`,
          HttpStatus.BAD_REQUEST
        );
      }

      const fileBuffer = await this.exportService.downloadExport(jobId);
      
      // Set appropriate headers
      const fileName = `export_${job.type}_${jobId}.${job.format}`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', this.getContentType(job.format));
      res.setHeader('Content-Length', fileBuffer.length);
      
      res.send(fileBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to download export: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get user's export jobs
   */
  @Get('jobs')
  @RequireAdminPermissions(AdminPermission.EXPORT_DATA)
  @ApiOperation({
    summary: 'Get User Export Jobs',
    description: 'Get all export jobs created by the current admin user'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of jobs to return',
    example: 20
  })
  @ApiResponse({
    status: 200,
    description: 'Export jobs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              format: { type: 'string' },
              status: { type: 'string' },
              progress: { type: 'number' },
              downloadUrl: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              completedAt: { type: 'string', format: 'date-time' },
              errorMessage: { type: 'string' },
              fileSize: { type: 'number' },
              recordCount: { type: 'number' }
            }
          }
        },
        total: { type: 'number' }
      }
    }
  })
  async getUserExportJobs(
    @Req() req: any,
    @Query('limit') limit?: number
  ): Promise<{ 
    jobs: Array<{
      id: string;
      type: ExportType;
      format: ExportFormat;
      status: string;
      progress: number;
      downloadUrl?: string;
      createdAt: Date;
      completedAt?: Date;
      errorMessage?: string;
      fileSize?: number;
      recordCount?: number;
    }>; 
    total: number 
  }> {
    const adminUserId = req.user.sub || req.user._id || req.user.userId;
    const jobs = await this.exportService.getUserExportJobs(adminUserId);
    
    const limitedJobs = limit ? jobs.slice(0, limit) : jobs;
    
    return {
      jobs: limitedJobs.map(job => ({
        id: job.id,
        type: job.type,
        format: job.format,
        status: job.status,
        progress: job.progress,
        downloadUrl: job.downloadUrl,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
        fileSize: job.fileSize,
        recordCount: job.recordCount
      })),
      total: jobs.length
    };
  }

  /**
   * Clean up expired export jobs
   */
  @Post('cleanup')
  @RequireAdminPermissions(AdminPermission.EXPORT_DATA)
  @AuditContext({ action: AdminAction.DATA_EXPORT, entityType: 'ExportJob' })
  @ApiOperation({
    summary: 'Cleanup Expired Jobs',
    description: 'Remove expired export jobs and their associated files'
  })
  @ApiResponse({
    status: 200,
    description: 'Cleanup completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        cleanedJobs: { type: 'number' }
      }
    }
  })
  async cleanupExpiredJobs(): Promise<{ message: string; cleanedJobs: number }> {
    await this.exportService.cleanupExpiredJobs();
    
    return {
      message: 'Expired export jobs cleaned up successfully',
      cleanedJobs: 0 // This would be returned by the service in a real implementation
    };
  }

  private getContentType(format: ExportFormat): string {
    switch (format) {
      case ExportFormat.CSV:
        return 'text/csv';
      case ExportFormat.EXCEL:
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case ExportFormat.PDF:
        return 'application/pdf';
      case ExportFormat.JSON:
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }
}
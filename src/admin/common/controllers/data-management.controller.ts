import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DataManagementService } from '../services/data-management.service';
import { BulkOperationService } from '../services/bulk-operation.service';
import { ValidationService } from '../services/validation.service';
import {
  PaginatedFilterDto,
  BulkOperationDto,
  BulkOperationResultDto,
  BulkOperationProgressDto,
  ValidationResultDto,
} from '../dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';

/**
 * Controller for data management operations
 * Provides endpoints for filtering, bulk operations, and validation
 */
@ApiTags('Admin - Data Management')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@Controller('admin/data-management')
export class DataManagementController {
  constructor(
    private readonly dataManagementService: DataManagementService,
    private readonly bulkOperationService: BulkOperationService,
    private readonly validationService: ValidationService
  ) {}

  /**
   * Get progress of a bulk operation
   */
  @Get('bulk-operations/:operationId/progress')
  @ApiOperation({ summary: 'Get bulk operation progress' })
  @ApiResponse({
    status: 200,
    description: 'Operation progress retrieved',
    type: BulkOperationProgressDto,
  })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  getOperationProgress(
    @Param('operationId') operationId: string
  ): BulkOperationProgressDto {
    return this.bulkOperationService.getOperationProgress(operationId);
  }

  /**
   * Get all active bulk operations
   */
  @Get('bulk-operations/active')
  @ApiOperation({ summary: 'Get all active bulk operations' })
  @ApiResponse({
    status: 200,
    description: 'Active operations retrieved',
    type: [BulkOperationProgressDto],
  })
  getActiveOperations(): BulkOperationProgressDto[] {
    return this.bulkOperationService.getActiveOperations();
  }

  /**
   * Cancel a bulk operation
   */
  @Post('bulk-operations/:operationId/cancel')
  @ApiOperation({ summary: 'Cancel a bulk operation' })
  @ApiResponse({ status: 200, description: 'Operation cancelled' })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed operation' })
  cancelOperation(@Param('operationId') operationId: string): { message: string } {
    this.bulkOperationService.cancelOperation(operationId);
    return { message: 'Operation cancelled successfully' };
  }

  /**
   * Validate data against constraints
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate data against constraints' })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: ValidationResultDto,
  })
  async validateData(
    @Body() body: { data: Record<string, any>; constraints: Record<string, any> }
  ): Promise<ValidationResultDto> {
    return this.validationService.validateData(body.data, body.constraints);
  }
}

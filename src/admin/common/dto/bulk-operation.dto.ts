import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsEnum, MinLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * Bulk operation action types
 */
export enum BulkOperationAction {
  DELETE = 'delete',
  UPDATE = 'update',
  APPROVE = 'approve',
  REJECT = 'reject',
  SUSPEND = 'suspend',
  ACTIVATE = 'activate',
  ARCHIVE = 'archive',
  RESTORE = 'restore',
  EXPORT = 'export',
}

/**
 * Bulk operation status
 */
export enum BulkOperationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIALLY_COMPLETED = 'partially_completed',
  CANCELLED = 'cancelled',
}

/**
 * Base DTO for bulk operations
 */
export class BulkOperationDto {
  @ApiProperty({
    description: 'Array of entity IDs to perform operation on',
    type: [String],
    minItems: 1,
    maxItems: 1000,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  ids: string[];

  @ApiProperty({
    description: 'Action to perform on the entities',
    enum: BulkOperationAction,
  })
  @IsEnum(BulkOperationAction)
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for the bulk operation (required for some actions)',
    minLength: 10,
  })
  @IsString()
  @IsOptional()
  @MinLength(10)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the operation',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Bulk update DTO with update data
 */
export class BulkUpdateDto extends BulkOperationDto {
  @ApiProperty({
    description: 'Update data to apply to all entities',
  })
  updateData: Record<string, any>;
}

/**
 * Bulk operation progress response
 */
export class BulkOperationProgressDto {
  @ApiProperty({ description: 'Unique operation ID' })
  operationId: string;

  @ApiProperty({
    description: 'Current status of the operation',
    enum: BulkOperationStatus,
  })
  status: string;

  @ApiProperty({ description: 'Total number of items to process' })
  totalItems: number;

  @ApiProperty({ description: 'Number of items processed so far' })
  processedItems: number;

  @ApiProperty({ description: 'Number of successful operations' })
  successCount: number;

  @ApiProperty({ description: 'Number of failed operations' })
  failureCount: number;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progressPercentage: number;

  @ApiProperty({ description: 'Operation start time' })
  startedAt: Date;

  @ApiPropertyOptional({ description: 'Operation completion time' })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Estimated time remaining in seconds' })
  estimatedTimeRemaining?: number;

  @ApiPropertyOptional({
    description: 'Array of failures with details',
  })
  failures?: Array<{
    itemId: string;
    error: string;
    code?: string;
  }>;

  @ApiPropertyOptional({ description: 'Error message if operation failed' })
  errorMessage?: string;
}

/**
 * Bulk operation result response
 */
export class BulkOperationResultDto {
  @ApiProperty({ description: 'Operation ID' })
  operationId: string;

  @ApiProperty({ description: 'Whether the operation completed successfully' })
  success: boolean;

  @ApiProperty({ description: 'Result message' })
  message: string;

  @ApiProperty({ description: 'Total number of items' })
  totalItems: number;

  @ApiProperty({ description: 'Number of successful operations' })
  successCount: number;

  @ApiProperty({ description: 'Number of failed operations' })
  failureCount: number;

  @ApiProperty({
    description: 'Array of failures with details',
  })
  failures: Array<{
    itemId: string;
    error: string;
    code?: string;
  }>;

  @ApiProperty({ description: 'Operation duration in milliseconds' })
  duration: number;

  @ApiPropertyOptional({ description: 'Additional result data' })
  data?: any;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsString,
  IsArray,
  IsDateString,
  IsBoolean,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Sort Order Enum
 */
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Admin Pagination DTO
 * Standardized pagination parameters for all admin endpoints
 * 
 * Validates: Requirements 9.3
 */
export class AdminPaginationDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Page number',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Items per page',
    example: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
  })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    description: 'Sort order',
    example: SortOrder.DESC,
  })
  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: string = SortOrder.DESC;

  /**
   * Calculate skip value for database queries
   */
  get skip(): number {
    const page = this.page ?? 1;
    const limit = this.limit ?? 20;
    return (page - 1) * limit;
  }
}

/**
 * Admin Date Range DTO
 * Standardized date range filtering
 * 
 * Validates: Requirements 9.1
 */
export class AdminDateRangeDto {
  @ApiPropertyOptional({
    description: 'Start date (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601 format)',
    example: '2024-01-31T23:59:59.999Z',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

/**
 * Admin Bulk Operation DTO
 * Standardized bulk operation parameters
 * 
 * Validates: Requirements 9.5
 */
export class AdminBulkOperationDto {
  @ApiProperty({
    description: 'Array of entity IDs to operate on',
    example: ['64a1b2c3d4e5f6789abcdef0', '64a1b2c3d4e5f6789abcdef1'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({
    description: 'Action to perform',
    example: 'approve',
  })
  @IsString()
  @MinLength(1)
  action: string;

  @ApiPropertyOptional({
    description: 'Optional reason for the action',
    example: 'Bulk approval after review',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the operation',
    example: { priority: 'high' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Admin Bulk Operation Result DTO
 * Standardized bulk operation response
 * 
 * Validates: Requirements 9.5
 */
export class AdminBulkOperationResultDto {
  @ApiProperty({
    description: 'Total number of items processed',
    example: 10,
  })
  totalItems: number;

  @ApiProperty({
    description: 'Number of successful operations',
    example: 8,
  })
  successCount: number;

  @ApiProperty({
    description: 'Number of failed operations',
    example: 2,
  })
  failureCount: number;

  @ApiProperty({
    description: 'Details of failed operations',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        itemId: { type: 'string', example: '64a1b2c3d4e5f6789abcdef0' },
        error: { type: 'string', example: 'Item not found' },
        code: { type: 'string', example: 'NOT_FOUND' },
      },
    },
  })
  failures: Array<{
    itemId: string;
    error: string;
    code?: string;
  }>;

  @ApiProperty({
    description: 'IDs of successfully processed items',
    type: [String],
    example: ['64a1b2c3d4e5f6789abcdef0', '64a1b2c3d4e5f6789abcdef1'],
  })
  successfulIds: string[];

  constructor(
    totalItems: number,
    successCount: number,
    failures: Array<{ itemId: string; error: string; code?: string }>,
    successfulIds: string[]
  ) {
    this.totalItems = totalItems;
    this.successCount = successCount;
    this.failureCount = failures.length;
    this.failures = failures;
    this.successfulIds = successfulIds;
  }
}

/**
 * Admin Search DTO
 * Standardized search parameters
 * 
 * Validates: Requirements 9.1
 */
export class AdminSearchDto {
  @ApiPropertyOptional({
    description: 'Search term',
    example: 'john',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  @IsOptional()
  searchTerm?: string;

  @ApiPropertyOptional({
    description: 'Fields to search in',
    example: ['name', 'email'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  searchFields?: string[];

  @ApiPropertyOptional({
    description: 'Case-sensitive search',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  caseSensitive?: boolean = false;
}

/**
 * Admin Filter Base DTO
 * Base class for all admin filter DTOs
 * 
 * Validates: Requirements 9.1, 9.2, 9.3
 */
export class AdminFilterBaseDto extends AdminPaginationDto {
  @ApiPropertyOptional({
    description: 'Search term for filtering',
    example: 'john',
  })
  @IsString()
  @IsOptional()
  searchTerm?: string;

  @ApiPropertyOptional({
    description: 'Date range filter',
    type: AdminDateRangeDto,
  })
  @ValidateNested()
  @Type(() => AdminDateRangeDto)
  @IsOptional()
  dateRange?: AdminDateRangeDto;
}

/**
 * Admin Export DTO
 * Standardized export parameters
 * 
 * Validates: Requirements 5.6, 9.4
 */
export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
  JSON = 'json',
}

export class AdminExportDto {
  @ApiProperty({
    enum: ExportFormat,
    description: 'Export format',
    example: ExportFormat.CSV,
  })
  @IsEnum(ExportFormat)
  format: string;

  @ApiPropertyOptional({
    description: 'Fields to include in export',
    example: ['name', 'email', 'createdAt'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fields?: string[];

  @ApiPropertyOptional({
    description: 'Filters to apply before export',
  })
  @IsOptional()
  filters?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Include headers in export',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  includeHeaders?: boolean = true;
}

/**
 * Admin Action Reason DTO
 * Standardized reason for administrative actions
 * 
 * Validates: Requirements 7.1
 */
export class AdminActionReasonDto {
  @ApiProperty({
    description: 'Reason for the action',
    example: 'Policy violation',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'User posted inappropriate content',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

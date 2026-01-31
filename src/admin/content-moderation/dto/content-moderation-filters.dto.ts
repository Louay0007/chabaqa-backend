import { IsOptional, IsArray, IsEnum, IsString, IsDateString, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContentType, ModerationStatus, ModerationPriority } from '../../schemas/content-moderation-queue.schema';
import { PaginationOptions } from '../../common/interfaces/admin-interfaces';

/**
 * DTO for filtering content moderation queue
 */
export class ContentModerationFiltersDto implements PaginationOptions {
  @ApiPropertyOptional({ 
    description: 'Page number for pagination',
    minimum: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ 
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ 
    description: 'Field to sort by',
    default: 'submittedAt'
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'submittedAt';

  @ApiPropertyOptional({ 
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc'
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ 
    description: 'Filter by content types',
    enum: ContentType,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContentType, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  contentTypes?: ContentType[];

  @ApiPropertyOptional({ 
    description: 'Filter by moderation status',
    enum: ModerationStatus,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ModerationStatus, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  status?: ModerationStatus[];

  @ApiPropertyOptional({ 
    description: 'Filter by priority levels',
    enum: ModerationPriority,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ModerationPriority, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  priorities?: ModerationPriority[];

  @ApiPropertyOptional({ 
    description: 'Filter by creator ID'
  })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by community ID'
  })
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by reviewer ID'
  })
  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @ApiPropertyOptional({ 
    description: 'Start date for submission date range filter'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ 
    description: 'End date for submission date range filter'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ 
    description: 'Search term for content or creator search'
  })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by items requiring manual review'
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requiresManualReview?: boolean;

  @ApiPropertyOptional({ 
    description: 'Filter by items with reports'
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasReports?: boolean;

  @ApiPropertyOptional({ 
    description: 'Minimum report count'
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minReportCount?: number;

  @ApiPropertyOptional({ 
    description: 'Filter by tags',
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  tags?: string[];

  @ApiPropertyOptional({ 
    description: 'Filter by overdue items (past review deadline)'
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  overdue?: boolean;
}
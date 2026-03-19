import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsArray,
  IsEnum,
  IsDateString,
  IsNumber,
  ValidateNested,
  IsObject,
} from 'class-validator';

/**
 * Filter operator enum for advanced filtering
 */
export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_THAN = 'gt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in',
  NOT_IN = 'nin',
  CONTAINS = 'contains',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
  REGEX = 'regex',
  EXISTS = 'exists',
  BETWEEN = 'between',
}

/**
 * Logical operator for combining filters
 */
export enum LogicalOperator {
  AND = 'and',
  OR = 'or',
  NOT = 'not',
}

/**
 * Single filter condition
 */
export class FilterCondition {
  @ApiPropertyOptional({ description: 'Field name to filter on' })
  @IsString()
  field: string;

  @ApiPropertyOptional({
    description: 'Filter operator',
    enum: FilterOperator,
  })
  @IsEnum(FilterOperator)
  operator: string;

  @ApiPropertyOptional({ description: 'Filter value' })
  value: any;
}

/**
 * Advanced filter group with logical operators
 */
export class FilterGroup {
  @ApiPropertyOptional({
    description: 'Logical operator for combining conditions',
    enum: LogicalOperator,
    default: LogicalOperator.AND,
  })
  @IsEnum(LogicalOperator)
  @IsOptional()
  operator?: string = LogicalOperator.AND;

  @ApiPropertyOptional({
    description: 'Filter conditions',
    type: [FilterCondition],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterCondition)
  @IsOptional()
  conditions?: FilterCondition[];

  @ApiPropertyOptional({
    description: 'Nested filter groups',
    type: [FilterGroup],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterGroup)
  @IsOptional()
  groups?: FilterGroup[];
}

/**
 * Date range filter
 */
export class DateRangeFilter {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

/**
 * Number range filter
 */
export class NumberRangeFilter {
  @ApiPropertyOptional({ description: 'Minimum value' })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum value' })
  @IsNumber()
  @IsOptional()
  max?: number;
}

/**
 * Sort configuration
 */
export class SortConfig {
  @ApiPropertyOptional({ description: 'Field to sort by' })
  @IsString()
  field: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsEnum(['asc', 'desc'])
  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';
}

/**
 * Multi-field sort configuration
 */
export class MultiSortDto {
  @ApiPropertyOptional({
    description: 'Array of sort configurations',
    type: [SortConfig],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortConfig)
  @IsOptional()
  sorts?: SortConfig[];
}

/**
 * Advanced filtering DTO with multi-field support
 */
export class AdvancedFilterDto {
  @ApiPropertyOptional({
    description: 'Filter groups with logical operators',
    type: FilterGroup,
  })
  @ValidateNested()
  @Type(() => FilterGroup)
  @IsOptional()
  filters?: FilterGroup;

  @ApiPropertyOptional({
    description: 'Search term for full-text search',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Fields to search in (for full-text search)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  searchFields?: string[];

  @ApiPropertyOptional({
    description: 'Date range filters by field name',
  })
  @IsObject()
  @IsOptional()
  dateRanges?: Record<string, DateRangeFilter>;

  @ApiPropertyOptional({
    description: 'Number range filters by field name',
  })
  @IsObject()
  @IsOptional()
  numberRanges?: Record<string, NumberRangeFilter>;

  @ApiPropertyOptional({
    description: 'Multi-field sort configuration',
    type: MultiSortDto,
  })
  @ValidateNested()
  @Type(() => MultiSortDto)
  @IsOptional()
  sort?: MultiSortDto;
}

/**
 * Pagination with advanced filtering
 */
export class PaginatedFilterDto extends AdvancedFilterDto {
  @ApiPropertyOptional({
    description: 'Page number',
    minimum: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 20;

  get skip(): number {
    const page = this.page ?? 1;
    const limit = this.limit ?? 20;
    return (page - 1) * limit;
  }
}

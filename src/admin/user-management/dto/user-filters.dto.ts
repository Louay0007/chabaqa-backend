import { IsOptional, IsArray, IsEnum, IsString, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../schema/user.schema';

/**
 * User status for admin filtering
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

/**
 * Subscription types for filtering
 */
export enum SubscriptionType {
  FREE = 'free',
  PREMIUM = 'premium',
  CREATOR = 'creator'
}

/**
 * Date range DTO for filtering
 */
export class DateRangeDto {
  @ApiPropertyOptional({ description: 'Start date in ISO format' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date in ISO format' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Pagination DTO
 */
export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Sort field' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * User filtering DTO for admin user management
 */
export class UserFiltersDto extends PaginationDto {
  @ApiPropertyOptional({ 
    description: 'Filter by user status',
    enum: UserStatus,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(UserStatus, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  status?: UserStatus[];

  @ApiPropertyOptional({ 
    description: 'Filter by user roles',
    enum: UserRole,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  roles?: UserRole[];

  @ApiPropertyOptional({ 
    description: 'Filter by subscription types',
    enum: SubscriptionType,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(SubscriptionType, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  subscriptionType?: SubscriptionType[];

  @ApiPropertyOptional({ description: 'Search term for name, email, or username' })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiPropertyOptional({ description: 'Registration date range' })
  @IsOptional()
  registrationDateRange?: DateRangeDto;
}
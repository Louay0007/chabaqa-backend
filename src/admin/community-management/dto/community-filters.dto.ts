import { IsOptional, IsArray, IsEnum, IsString, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationOptions, DateRange } from '../../common/interfaces/admin-interfaces';

export enum CommunityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_APPROVAL = 'pending_approval',
  REJECTED = 'rejected'
}

export enum CommunityType {
  PUBLIC = 'public',
  PRIVATE = 'private'
}

export enum CommunityPriceType {
  FREE = 'free',
  ONE_TIME = 'one-time',
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}

export class CommunityFiltersDto implements PaginationOptions {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Field to sort by' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiProperty({ required: false, description: 'Search term for community name, description, or creator' })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiProperty({ required: false, enum: CommunityStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CommunityStatus, { each: true })
  status?: CommunityStatus[];

  @ApiProperty({ required: false, enum: CommunityType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CommunityType, { each: true })
  type?: CommunityType[];

  @ApiProperty({ required: false, enum: CommunityPriceType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(CommunityPriceType, { each: true })
  priceType?: CommunityPriceType[];

  @ApiProperty({ required: false, description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, description: 'Filter by creator ID' })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiProperty({ required: false, description: 'Minimum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minMembers?: number;

  @ApiProperty({ required: false, description: 'Maximum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMembers?: number;

  @ApiProperty({ required: false, description: 'Start date for creation date filter' })
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @ApiProperty({ required: false, description: 'End date for creation date filter' })
  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @ApiProperty({ required: false, description: 'Filter by featured status' })
  @IsOptional()
  @Type(() => Boolean)
  featured?: boolean;

  @ApiProperty({ required: false, description: 'Filter by verified status' })
  @IsOptional()
  @Type(() => Boolean)
  verified?: boolean;
}

export class CommunityApprovalFiltersDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiProperty({ required: false, description: 'Search term for community name or creator' })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiProperty({ required: false, description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, description: 'Filter by submission date range start' })
  @IsOptional()
  @IsDateString()
  submittedAfter?: string;

  @ApiProperty({ required: false, description: 'Filter by submission date range end' })
  @IsOptional()
  @IsDateString()
  submittedBefore?: string;
}
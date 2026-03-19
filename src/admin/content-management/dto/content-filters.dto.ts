import { IsOptional, IsString, IsEnum, IsDate, IsBoolean, IsNumber, Min, Max, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ContentStatus, ContentType, SortOrder } from '../enums/content-status.enum';

export class ContentFiltersDto {
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: string;

  @IsOptional()
  @IsEnum(ContentType)
  type?: string;

  @IsOptional()
  @IsString()
  communityId?: string;

  @IsOptional()
  @IsString()
  creatorId?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdAfter?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdBefore?: Date;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: string = SortOrder.DESC;
}

export class CourseFiltersDto extends ContentFiltersDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  level?: string;
}

export class ChallengeFiltersDto extends ContentFiltersDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateAfter?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateBefore?: Date;
}

export class EventFiltersDto extends ContentFiltersDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateAfter?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateBefore?: Date;

  @IsOptional()
  @IsString()
  location?: string;
}

export class PostFiltersDto extends ContentFiltersDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasComments?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasLikes?: boolean;
}

export class PaginationDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class SubmissionFiltersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  userId?: string;
}

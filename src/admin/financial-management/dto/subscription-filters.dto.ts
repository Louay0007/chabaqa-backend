import { IsOptional, IsEnum, IsArray, IsDateString, IsNumber, Min, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { SubscriptionStatus } from '../../../schema/subscription.schema';
import { PlanTier } from '../../../schema/plan.schema';

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class SubscriptionFiltersDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: SubscriptionStatus,
    isArray: true,
    description: 'Filter by subscription status',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(SubscriptionStatus, { each: true })
  status?: SubscriptionStatus[];

  @ApiPropertyOptional({
    enum: PlanTier,
    isArray: true,
    description: 'Filter by plan tier',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(PlanTier, { each: true })
  plan?: PlanTier[];

  @ApiPropertyOptional({
    description: 'Legacy alias for plan filter',
    enum: PlanTier,
  })
  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: string;

  @ApiPropertyOptional({
    description: 'Filter by creator ID',
  })
  @IsOptional()
  creatorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by subscriber ID',
  })
  @IsOptional()
  subscriberId?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering subscriptions',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering subscriptions',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter subscriptions that will cancel at period end',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  })
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['createdAt', 'currentPeriodStart', 'currentPeriodEnd', 'amount', 'status', 'plan'],
    default: 'createdAt',
  })
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortDirection,
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: 'asc' | 'desc' = 'desc';
}

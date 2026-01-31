import { IsOptional, IsEnum, IsArray, IsDateString, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SubscriptionStatus } from '../../../schema/subscription.schema';
import { PlanTier } from '../../../schema/plan.schema';

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
  @IsArray()
  @IsEnum(SubscriptionStatus, { each: true })
  status?: SubscriptionStatus[];

  @ApiPropertyOptional({
    enum: PlanTier,
    isArray: true,
    description: 'Filter by plan tier',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PlanTier, { each: true })
  plan?: PlanTier[];

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
  cancelAtPeriodEnd?: boolean;
}

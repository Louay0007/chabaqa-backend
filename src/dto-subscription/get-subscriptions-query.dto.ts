import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { SubscriptionStatus } from '../schema/subscription.schema';
import { PlanTier } from '../schema/plan.schema';

export class GetSubscriptionsQueryDto {
  @ApiPropertyOptional({ 
    description: 'Filter by subscription status',
    enum: SubscriptionStatus
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by plan tier',
    enum: PlanTier
  })
  @IsOptional()
  @IsEnum(PlanTier)
  plan?: string;

  @ApiPropertyOptional({ 
    description: 'Start date for filtering',
    example: '2024-01-01'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ 
    description: 'End date for filtering',
    example: '2024-12-31'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ 
    description: 'Page number',
    example: 1,
    default: 1
  })
  @IsOptional()
  @IsString()
  page?: string = '1';

  @ApiPropertyOptional({ 
    description: 'Items per page',
    example: 20,
    default: 20
  })
  @IsOptional()
  @IsString()
  limit?: string = '20';
}
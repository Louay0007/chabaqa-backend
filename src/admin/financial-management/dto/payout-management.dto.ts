import { IsOptional, IsEnum, IsArray, IsDateString, IsNumber, Min, IsString } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PayoutStatus, PayoutMethod } from '../../../schema/payout.schema';

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class PayoutFiltersDto {
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
    enum: PayoutStatus,
    isArray: true,
    description: 'Filter by payout status',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(PayoutStatus, { each: true })
  status?: PayoutStatus[];

  @ApiPropertyOptional({
    enum: PayoutMethod,
    isArray: true,
    description: 'Filter by payout method',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(PayoutMethod, { each: true })
  method?: PayoutMethod[];

  @ApiPropertyOptional({
    description: 'Filter by creator ID',
  })
  @IsOptional()
  creatorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by community ID',
  })
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering payouts',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering payouts',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Minimum payout amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Maximum payout amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['requestedAt', 'processedAt', 'scheduledFor', 'amount', 'status', 'method', 'createdAt', 'initiatedAt'],
    default: 'requestedAt',
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

export class UpdatePayoutStatusDto {
  @ApiProperty({
    enum: PayoutStatus,
    description: 'New status for the payout',
  })
  @IsEnum(PayoutStatus)
  status: string;

  @ApiPropertyOptional({
    description: 'Optional admin notes for the status update',
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class ProcessPayoutDto {
  @ApiProperty({
    description: 'Payout ID to process',
  })
  @IsString()
  payoutId: string;

  @ApiPropertyOptional({
    description: 'Optional processing notes',
  })
  @IsOptional()
  @IsString()
  processingNotes?: string;
}

export class BulkProcessPayoutsDto {
  @ApiProperty({
    description: 'Array of payout IDs to process',
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  payoutIds: string[];

  @ApiPropertyOptional({
    description: 'Optional processing notes for all payouts',
  })
  @IsOptional()
  @IsString()
  processingNotes?: string;
}

export class PayoutSummaryDto {
  @ApiProperty({ description: 'Total number of payouts' })
  totalPayouts: number;

  @ApiProperty({ description: 'Total amount of all payouts' })
  totalAmount: number;

  @ApiProperty({ description: 'Number of pending payouts' })
  pendingCount: number;

  @ApiProperty({ description: 'Amount of pending payouts' })
  pendingAmount: number;

  @ApiProperty({ description: 'Number of completed payouts' })
  completedCount: number;

  @ApiProperty({ description: 'Amount of completed payouts' })
  completedAmount: number;

  @ApiProperty({ description: 'Number of failed payouts' })
  failedCount: number;

  @ApiProperty({ description: 'Amount of failed payouts' })
  failedAmount: number;

  @ApiProperty({ description: 'Number of scheduled payouts' })
  scheduledCount: number;

  @ApiProperty({ description: 'Amount of scheduled payouts' })
  scheduledAmount: number;
}

import { IsOptional, IsEnum, IsArray, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WalletTransactionType } from '../../../schema/wallet-transaction.schema';

export class TransactionFiltersDto {
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
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: WalletTransactionType,
    isArray: true,
    description: 'Filter by transaction type',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(WalletTransactionType, { each: true })
  type?: WalletTransactionType[];

  @ApiPropertyOptional({
    description: 'Filter by user ID',
  })
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Start date for filtering transactions',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering transactions',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Minimum transaction amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Maximum transaction amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @ApiPropertyOptional({
    description: 'Search by reference number',
  })
  @IsOptional()
  reference?: string;
}

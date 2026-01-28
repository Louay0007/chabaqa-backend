import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { PayoutStatus, PayoutMethod } from '../schema/payout.schema';

export class GetPayoutsQueryDto {
  @ApiPropertyOptional({ 
    description: 'Filter by payout status',
    enum: PayoutStatus
  })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiPropertyOptional({ 
    description: 'Filter by payout method',
    enum: PayoutMethod
  })
  @IsOptional()
  @IsEnum(PayoutMethod)
  method?: PayoutMethod;

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
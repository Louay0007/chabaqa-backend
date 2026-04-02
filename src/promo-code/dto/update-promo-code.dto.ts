import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsArray, IsDateString, Min, Max } from 'class-validator';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export class UpdatePromoCodeDto {
  @ApiPropertyOptional({ 
    description: 'Percentage discount (0-100)',
    example: 25,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentOff?: number;

  @ApiPropertyOptional({ 
    description: 'Fixed amount discount in DT',
    example: 10,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountOffDT?: number;

  @ApiPropertyOptional({ 
    description: 'Content type this promo applies to',
    enum: TrackableContentType
  })
  @IsOptional()
  @IsEnum(TrackableContentType)
  appliesToType?: TrackableContentType;

  @ApiPropertyOptional({ 
    description: 'Specific content ID'
  })
  @IsOptional()
  @IsString()
  appliesToId?: string;

  @ApiPropertyOptional({ 
    description: 'Start date (ISO 8601)'
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ 
    description: 'End date (ISO 8601)'
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ 
    description: 'Maximum number of redemptions'
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ 
    description: 'Is the promo code active'
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ 
    description: 'List of allowed emails',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmails?: string[];
}

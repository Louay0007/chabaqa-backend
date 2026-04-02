import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsArray, IsDateString, Min, Max, MinLength, MaxLength } from 'class-validator';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export class CreatePromoCodeDto {
  @ApiProperty({ 
    description: 'Unique promo code (will be converted to uppercase)',
    example: 'SUMMER25',
    minLength: 3,
    maxLength: 50
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  code: string;

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
    description: 'Content type this promo applies to (null = all types)',
    enum: TrackableContentType,
    example: 'course'
  })
  @IsOptional()
  @IsEnum(TrackableContentType)
  appliesToType?: TrackableContentType;

  @ApiPropertyOptional({ 
    description: 'Specific content ID (null = all content of that type)',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsString()
  appliesToId?: string;

  @ApiPropertyOptional({ 
    description: 'Creator ID who owns this promo code',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiPropertyOptional({ 
    description: 'Community ID this promo is associated with',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsString()
  communityId?: string;

  @ApiPropertyOptional({ 
    description: 'Start date (ISO 8601)',
    example: '2024-06-01T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ 
    description: 'End date (ISO 8601)',
    example: '2024-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ 
    description: 'Maximum number of redemptions (null = unlimited)',
    example: 100,
    minimum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ 
    description: 'Is the promo code active',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ 
    description: 'List of allowed emails (empty = everyone)',
    example: ['vip@example.com', 'premium@example.com'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmails?: string[];
}

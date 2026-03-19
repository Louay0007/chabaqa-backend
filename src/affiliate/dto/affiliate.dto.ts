import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackableContentType } from '../../schema/content-tracking.schema';

export class CreateProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  communityId?: string;

  @ApiProperty({ enum: ['community', 'creator', 'content'] })
  @IsEnum(['community', 'creator', 'content'])
  scopeType: 'community' | 'creator' | 'content';

  @ApiPropertyOptional({ enum: Object.values(TrackableContentType) })
  @IsOptional()
  @IsEnum(TrackableContentType)
  scopeContentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeContentId?: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  cookieWindowDays?: number;

  @ApiPropertyOptional({ default: 14 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(90)
  holdDays?: number;
}

export class UpdateProgramDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ enum: ['active', 'paused'] })
  @IsOptional()
  @IsEnum(['active', 'paused'])
  status?: 'active' | 'paused';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  cookieWindowDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(90)
  holdDays?: number;
}

export class InvitePartnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
}

export class UpdatePartnerDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'paused'] })
  @IsEnum(['approved', 'rejected', 'paused'])
  status: 'approved' | 'rejected' | 'paused';
}

export class CreateLinkDto {
  @ApiProperty()
  @IsMongoId()
  programId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  partnerUserId?: string;

  @ApiProperty({ description: 'Relative path starting with /' })
  @IsString()
  targetPath: string;

  @ApiPropertyOptional({ enum: Object.values(TrackableContentType) })
  @IsOptional()
  @IsEnum(TrackableContentType)
  targetContentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetContentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  communityId?: string;
}

export class CreatePartnerLinkDto {
  @ApiProperty()
  @IsMongoId()
  programId: string;

  @ApiProperty({ description: 'Relative path starting with /' })
  @IsString()
  targetPath: string;

  @ApiPropertyOptional({ enum: Object.values(TrackableContentType) })
  @IsOptional()
  @IsEnum(TrackableContentType)
  targetContentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetContentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  communityId?: string;
}

export class RequestPayoutDto {
  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  amountDT: number;

  @ApiProperty({ enum: ['bank_transfer', 'paypal', 'stripe'] })
  @IsEnum(['bank_transfer', 'paypal', 'stripe'])
  method: 'bank_transfer' | 'paypal' | 'stripe';

  @ApiPropertyOptional({ description: 'Bank details, PayPal email, or Stripe account ID' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class AdminPayoutActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class StatsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}

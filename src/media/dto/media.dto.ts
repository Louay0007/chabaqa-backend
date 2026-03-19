import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MediaPurpose, MediaVisibility } from '../media.types';

export class MediaUploadBodyDto {
  @ApiPropertyOptional({ enum: MediaPurpose, default: MediaPurpose.GENERIC })
  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;

  @ApiPropertyOptional({ enum: MediaVisibility })
  @IsOptional()
  @IsEnum(MediaVisibility)
  visibility?: string;
}

export class MediaPresignDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  size: number;

  @ApiPropertyOptional({ enum: MediaPurpose, default: MediaPurpose.GENERIC })
  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;
}

export class MediaCompleteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  size: number;

  @ApiPropertyOptional({ enum: MediaPurpose, default: MediaPurpose.GENERIC })
  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checksum?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ enum: MediaVisibility })
  @IsOptional()
  @IsEnum(MediaVisibility)
  visibility?: string;
}


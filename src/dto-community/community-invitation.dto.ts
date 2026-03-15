import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsEnum,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Sub-DTOs
// ---------------------------------------------------------------------------

export class ContactEntryDto {
  @ApiProperty({ description: 'Email address', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Contact name', example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

// ---------------------------------------------------------------------------
// Import (bulk)
// ---------------------------------------------------------------------------

export class ImportContactsDto {
  @ApiProperty({
    description: 'List of contacts to invite',
    type: [ContactEntryDto],
    maxItems: 500,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ContactEntryDto)
  contacts: ContactEntryDto[];

  @ApiProperty({
    description: 'Community ID to invite contacts to',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiPropertyOptional({
    description: 'Optional personal message included in the invitation email',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalMessage?: string;
}

// ---------------------------------------------------------------------------
// Single invite
// ---------------------------------------------------------------------------

export class InviteSingleDto {
  @ApiProperty({ description: 'Email address to invite', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Contact name', example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    description: 'Community ID to invite the contact to',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiPropertyOptional({
    description: 'Optional personal message included in the invitation email',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalMessage?: string;
}

// ---------------------------------------------------------------------------
// Query / Filters
// ---------------------------------------------------------------------------

export class InvitationQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['all', 'pending', 'accepted', 'expired', 'revoked'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search by email or name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

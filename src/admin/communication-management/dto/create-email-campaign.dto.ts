import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDateString,
  IsObject,
  MinLength,
  MaxLength,
  IsMongoId,
} from 'class-validator';

export enum CampaignType {
  ANNOUNCEMENT = 'announcement',
  NEWSLETTER = 'newsletter',
  PROMOTION = 'promotion',
  EVENT_REMINDER = 'event_reminder',
  COURSE_UPDATE = 'course_update',
  CUSTOM = 'custom',
}

export enum AudienceTargetType {
  ALL_USERS = 'all_users',
  COMMUNITY_MEMBERS = 'community_members',
  ACTIVE_USERS = 'active_users',
  INACTIVE_USERS = 'inactive_users',
  SPECIFIC_USERS = 'specific_users',
  USER_ROLE = 'user_role',
}

export class AdminCreateEmailCampaignDto {
  @ApiProperty({
    description: 'Campaign title',
    example: 'Welcome to Our Platform',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'Welcome! Get started with your journey',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email content (HTML or plain text)',
    example: '<h1>Welcome!</h1><p>We are excited to have you here.</p>',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Campaign type',
    enum: CampaignType,
    example: CampaignType.ANNOUNCEMENT,
  })
  @IsEnum(CampaignType)
  type: string;

  @ApiProperty({
    description: 'Audience targeting type',
    enum: AudienceTargetType,
    example: AudienceTargetType.ALL_USERS,
  })
  @IsEnum(AudienceTargetType)
  audienceTarget: string;

  @ApiPropertyOptional({
    description: 'Community ID for community-specific campaigns',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  communityId?: string;

  @ApiPropertyOptional({
    description: 'Specific user IDs to target',
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  specificUserIds?: string[];

  @ApiPropertyOptional({
    description: 'User roles to target',
    type: [String],
    example: ['creator', 'member'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({
    description: 'Template ID to use',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Scheduled send date (ISO 8601 format)',
    example: '2024-12-31T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Whether content is HTML',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to track email opens',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to track email clicks',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({
    description: 'Personalization variables',
    example: { userName: '{{name}}', communityName: '{{community}}' },
  })
  @IsOptional()
  @IsObject()
  personalizationVariables?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { source: 'admin_panel', priority: 'high' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

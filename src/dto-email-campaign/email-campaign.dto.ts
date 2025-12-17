import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsBoolean, 
  IsEnum, 
  IsDateString, 
  IsNumber, 
  Min, 
  Max, 
  MaxLength, 
  MinLength,
  IsObject,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  EmailCampaignType, 
  EmailCampaignStatus, 
  InactivityPeriod 
} from '../schema/email-campaign.schema';

/**
 * DTO for creating a regular email campaign
 */
export class CreateEmailCampaignDto {
  @ApiProperty({
    description: 'Campaign title',
    example: 'Welcome to our community!',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'Welcome to our amazing community!',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email content (HTML or plain text)',
    example: 'Welcome to our community! We are excited to have you join us...'
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Community ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiPropertyOptional({
    description: 'Campaign type',
    enum: EmailCampaignType,
    example: EmailCampaignType.ANNOUNCEMENT
  })
  @IsOptional()
  @IsEnum(EmailCampaignType)
  type?: EmailCampaignType;

  @ApiPropertyOptional({
    description: 'Schedule date (ISO string)',
    example: '2024-02-15T10:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Use HTML content',
    example: true,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({
    description: 'Track email opens',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({
    description: 'Track email clicks',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({
    description: 'Campaign metadata',
    example: { priority: 'high', tags: ['welcome', 'onboarding'] }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO for creating an inactive user campaign
 */
export class CreateInactiveUserCampaignDto {
  @ApiProperty({
    description: 'Campaign title',
    example: 'We miss you! Come back to our community',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'We miss you! Come back to {{communityName}}',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email content template with variables',
    example: 'Hi {{userName}}! We noticed you haven\'t logged in for {{daysThreshold}} days...'
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Community ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Target inactivity period',
    enum: InactivityPeriod,
    example: InactivityPeriod.LAST_7_DAYS
  })
  @IsEnum(InactivityPeriod)
  inactivityPeriod: InactivityPeriod;

  @ApiPropertyOptional({
    description: 'Target all inactive users regardless of period',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  targetAllInactive?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of recipients',
    example: 500,
    minimum: 1,
    maximum: 1000
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxRecipients?: number;

  @ApiPropertyOptional({
    description: 'Schedule date (ISO string)',
    example: '2024-02-15T10:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Use HTML content',
    example: true,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({
    description: 'Track email opens',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({
    description: 'Track email clicks',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({
    description: 'Campaign metadata',
    example: { reactivationStrategy: 'friendly', priority: 'medium' }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO for updating an email campaign
 */
export class UpdateEmailCampaignDto {
  @ApiPropertyOptional({
    description: 'Campaign title',
    example: 'Updated campaign title',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Email subject line',
    example: 'Updated subject line',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    description: 'Email content',
    example: 'Updated email content...'
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Campaign status',
    enum: EmailCampaignStatus,
    example: EmailCampaignStatus.SCHEDULED
  })
  @IsOptional()
  @IsEnum(EmailCampaignStatus)
  status?: EmailCampaignStatus;

  @ApiPropertyOptional({
    description: 'Schedule date (ISO string)',
    example: '2024-02-15T10:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Use HTML content',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({
    description: 'Track email opens',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({
    description: 'Track email clicks',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({
    description: 'Campaign metadata',
    example: { priority: 'high', tags: ['updated'] }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO for campaign query parameters
 */
export class EmailCampaignQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 10,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Campaign status filter',
    enum: EmailCampaignStatus,
    example: EmailCampaignStatus.SENT
  })
  @IsOptional()
  @IsEnum(EmailCampaignStatus)
  status?: EmailCampaignStatus;

  @ApiPropertyOptional({
    description: 'Campaign type filter',
    enum: EmailCampaignType,
    example: EmailCampaignType.ANNOUNCEMENT
  })
  @IsOptional()
  @IsEnum(EmailCampaignType)
  type?: EmailCampaignType;

  @ApiPropertyOptional({
    description: 'Filter inactive user campaigns only',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  inactiveUserCampaigns?: boolean;

  @ApiPropertyOptional({
    description: 'Search term for title or subject',
    example: 'welcome'
  })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * DTO for inactive user query parameters
 */
export class InactiveUserQueryDto {
  @ApiPropertyOptional({
    description: 'Inactivity period filter',
    enum: InactivityPeriod,
    example: InactivityPeriod.LAST_7_DAYS
  })
  @IsOptional()
  @IsEnum(InactivityPeriod)
  period?: InactivityPeriod;

  @ApiPropertyOptional({
    description: 'Maximum number of users to return',
    example: 100,
    minimum: 1,
    maximum: 1000
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 100;
}

/**
 * Response DTO for campaign statistics
 */
export class CampaignStatsDto {
  @ApiProperty({ description: 'Total campaigns' })
  totalCampaigns: number;

  @ApiProperty({ description: 'Total emails sent' })
  totalEmailsSent: number;

  @ApiProperty({ description: 'Total emails failed' })
  totalEmailsFailed: number;

  @ApiProperty({ description: 'Total opens' })
  totalOpens: number;

  @ApiProperty({ description: 'Total clicks' })
  totalClicks: number;

  @ApiProperty({ description: 'Average open rate (%)' })
  averageOpenRate: number;

  @ApiProperty({ description: 'Average click rate (%)' })
  averageClickRate: number;

  @ApiProperty({ description: 'Reactivation campaigns count' })
  reactivationCampaigns: number;

  @ApiProperty({ description: 'Reactivation success rate' })
  reactivationSuccessRate: number;
}

/**
 * Response DTO for inactive user statistics
 */
export class InactiveUserStatsDto {
  @ApiProperty({ description: 'Total community members' })
  totalMembers: number;

  @ApiProperty({ description: 'Active users count' })
  activeUsers: number;

  @ApiProperty({ description: 'Inactive 7 days count' })
  inactive7d: number;

  @ApiProperty({ description: 'Inactive 15 days count' })
  inactive15d: number;

  @ApiProperty({ description: 'Inactive 30 days count' })
  inactive30d: number;

  @ApiProperty({ description: 'Inactive 60+ days count' })
  inactive60dPlus: number;

  @ApiProperty({ description: 'Total inactive users' })
  totalInactiveUsers: number;

  @ApiProperty({ description: 'Inactivity breakdown' })
  breakdown: any[];
}

/**
 * DTO for creating content reminder campaigns
 */
export class CreateContentReminderDto {
  @ApiProperty({
    description: 'Campaign title',
    example: 'New Event Reminder',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'New Event: {{eventTitle}}',
    maxLength: 200
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email content template',
    example: 'Hi {{userName}}! We have a new {{contentType}} available: {{contentTitle}}...'
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Community ID',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Type of content to remind about',
    enum: ['event', 'challenge', 'cours', 'product', 'session', 'all'],
    example: 'event'
  })
  @IsString()
  @IsNotEmpty()
  @IsEnum(['event', 'challenge', 'cours', 'product', 'session', 'all'])
  contentType: 'event' | 'challenge' | 'cours' | 'product' | 'session' | 'all';

  @ApiPropertyOptional({
    description: 'Specific content ID to remind about (optional)',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiPropertyOptional({
    description: 'Schedule date (ISO string)',
    example: '2024-02-15T10:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Use HTML content',
    example: true,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({
    description: 'Track email opens',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({
    description: 'Track email clicks',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({
    description: 'Campaign metadata',
    example: { contentReminder: true, contentType: 'event' }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

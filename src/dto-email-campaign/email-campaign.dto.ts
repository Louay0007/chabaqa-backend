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
  type?: string;

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
  inactivityPeriod: string;

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
  status?: string;

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
  status?: string;

  @ApiPropertyOptional({
    description: 'Campaign type filter',
    enum: EmailCampaignType,
    example: EmailCampaignType.ANNOUNCEMENT
  })
  @IsOptional()
  @IsEnum(EmailCampaignType)
  type?: string;

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
  period?: string;

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

// ─── Course Progress Filter Campaign ─────────────────────────────────────────

/**
 * DTO for creating a course-progress reminder campaign.
 * Targets enrolled users whose completion is below a threshold after N days.
 */
export class CreateCourseProgressCampaignDto {
  @ApiProperty({ example: 'Finish your course – you are almost there!', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '{{userName}}, you still have {{progressPct}}% to go!', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'Hi {{userName}}, you enrolled {{enrolledDays}} days ago but are only {{progressPct}}% through. Jump back in!' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Community ID' })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439012', description: 'Course ID to target enrollments from' })
  @IsString()
  @IsNotEmpty()
  targetCourseId: string;

  @ApiProperty({
    example: 20,
    description: 'Send email to users whose progress is LESS THAN this percentage (0-100)',
    minimum: 1,
    maximum: 99,
  })
  @IsNumber()
  @Min(1)
  @Max(99)
  targetMaxProgressPct: number;

  @ApiProperty({
    example: 15,
    description: 'Only target users who enrolled at least this many days ago',
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  targetMinEnrolledDays: number;

  @ApiPropertyOptional({ example: '2024-02-15T10:00:00.000Z', description: 'Schedule send date' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;

  @ApiPropertyOptional({ example: 500, minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5000)
  maxRecipients?: number;
}

// ─── Preview Audience ─────────────────────────────────────────────────────────

export class PreviewAudienceInactiveFilterDto {
  @ApiProperty({ example: 15, description: 'Inactive for at least this many days', minimum: 1 })
  @IsNumber()
  @Min(1)
  minInactiveDays: number;
}

export class PreviewAudienceCourseProgressFilterDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 20, minimum: 1, maximum: 99 })
  @IsNumber()
  @Min(1)
  @Max(99)
  maxProgressPct: number;

  @ApiProperty({ example: 15, minimum: 1 })
  @IsNumber()
  @Min(1)
  minEnrolledDays: number;
}

export class PreviewAudienceDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({ enum: ['inactivity', 'course_progress'], example: 'inactivity' })
  @IsString()
  @IsEnum(['inactivity', 'course_progress'])
  filterType: 'inactivity' | 'course_progress';

  @ApiPropertyOptional({ type: () => PreviewAudienceInactiveFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreviewAudienceInactiveFilterDto)
  inactiveFilter?: PreviewAudienceInactiveFilterDto;

  @ApiPropertyOptional({ type: () => PreviewAudienceCourseProgressFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreviewAudienceCourseProgressFilterDto)
  courseProgressFilter?: PreviewAudienceCourseProgressFilterDto;
}

export class PreviewAudienceResponseDto {
  @ApiProperty({ example: 47, description: 'Total users matching the filter' })
  total: number;

  @ApiProperty({ description: 'Sample of first 10 matching users' })
  sample: Array<{ userId: string; email: string; name: string }>;

  @ApiProperty({ example: 'inactivity', description: 'The filter type used' })
  filterType: string;
}

// ─── Welcome / Automation Template ───────────────────────────────────────────

/**
 * DTO for creating or updating a community's automated welcome email template.
 */
export class CreateWelcomeTemplateDto {
  @ApiProperty({ example: 'Welcome to {{communityName}}! 🎉', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: 'Hi {{userName}}, welcome to {{communityName}}! We are thrilled to have you. Here is what you can do next...',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ default: true, description: 'Whether this email is HTML' })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Start sending immediately when enabled' })
  @IsOptional()
  @IsBoolean()
  automationActive?: boolean;
}

export class UpdateWelcomeTemplateDto {
  @ApiPropertyOptional({ example: 'Welcome to {{communityName}}!', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;
}

// ─── Continuous Inactivity Automation ────────────────────────────────────────

/**
 * Set-and-forget automation: send this email automatically to any member
 * who reaches exactly N days of inactivity (checked daily).
 */
export class CreateInactivityAutomationDto {
  @ApiProperty({ example: 'We miss you! Come back to {{communityName}}', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '{{userName}}, we miss you in {{communityName}}!', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: 'Hi {{userName}}, you haven\'t visited {{communityName}} in {{daysThreshold}} days. Here is what you missed...',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    example: 15,
    description: 'Trigger this email when a user has been inactive for exactly this many days',
    minimum: 1,
    maximum: 365,
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  minInactiveDays: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isHtml?: boolean;
}


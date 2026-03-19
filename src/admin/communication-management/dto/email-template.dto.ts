import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';

export enum TemplateCategory {
  WELCOME = 'welcome',
  ANNOUNCEMENT = 'announcement',
  NEWSLETTER = 'newsletter',
  TRANSACTIONAL = 'transactional',
  MARKETING = 'marketing',
  NOTIFICATION = 'notification',
  CUSTOM = 'custom',
}

export class CreateEmailTemplateDto {
  @ApiProperty({
    description: 'Template name',
    example: 'Welcome Email',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Template description',
    example: 'Welcome email sent to new users',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.WELCOME,
  })
  @IsEnum(TemplateCategory)
  category: string;

  @ApiProperty({
    description: 'Email subject template',
    example: 'Welcome to {{platformName}}, {{userName}}!',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Email content template (HTML)',
    example: '<h1>Welcome {{userName}}!</h1><p>We are excited to have you on {{platformName}}.</p>',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'Available template variables',
    type: [String],
    example: ['userName', 'platformName', 'communityName'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    description: 'Whether template is active',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Template tags for organization',
    type: [String],
    example: ['onboarding', 'user-engagement'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { author: 'admin', version: '1.0' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional({
    description: 'Template name',
    example: 'Welcome Email',
    minLength: 3,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Template description',
    example: 'Welcome email sent to new users',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Template category',
    enum: TemplateCategory,
    example: TemplateCategory.WELCOME,
  })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: string;

  @ApiPropertyOptional({
    description: 'Email subject template',
    example: 'Welcome to {{platformName}}, {{userName}}!',
    minLength: 3,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    description: 'Email content template (HTML)',
    example: '<h1>Welcome {{userName}}!</h1><p>We are excited to have you on {{platformName}}.</p>',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Available template variables',
    type: [String],
    example: ['userName', 'platformName', 'communityName'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    description: 'Whether template is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Template tags for organization',
    type: [String],
    example: ['onboarding', 'user-engagement'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { author: 'admin', version: '1.1' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class TestEmailTemplateDto {
  @ApiProperty({
    description: 'Test recipient email address',
    example: 'test@example.com',
  })
  @IsString()
  @IsNotEmpty()
  testEmail: string;

  @ApiPropertyOptional({
    description: 'Test data for template variables',
    example: { userName: 'John Doe', platformName: 'Chabaqa' },
  })
  @IsOptional()
  @IsObject()
  testData?: Record<string, any>;
}

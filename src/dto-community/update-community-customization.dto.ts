import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const CUSTOM_DOMAIN_REGEX =
  /^(?!:\/\/)(?!.*\/)(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const toOptionalTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toOptionalStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized;
};

export enum CommunityPriceType {
  FREE = 'free',
  ONE_TIME = 'one-time',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum CommunityType {
  COMMUNITY = 'community',
  COURSE = 'course',
  CHALLENGE = 'challenge',
  EVENT = 'event',
  ONE_TO_ONE = 'oneToOne',
  PRODUCT = 'product',
}

export enum HeaderStyle {
  DEFAULT = 'default',
  CENTERED = 'centered',
  MINIMAL = 'minimal',
}

export enum ContentWidth {
  NARROW = 'narrow',
  NORMAL = 'normal',
  WIDE = 'wide',
  FULL = 'full',
}

export class UpdateCommunitySocialLinksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  twitter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  instagram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  linkedin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  discord?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  behance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  github?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  facebook?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  youtube?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  tiktok?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class UpdateCommunitySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(1000)
  welcomeMessage?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  features?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(220, { each: true })
  benefits?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(1000)
  logo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(1000)
  heroBackground?: string;

  @ApiPropertyOptional({ enum: HeaderStyle })
  @IsOptional()
  @IsEnum(HeaderStyle)
  headerStyle?: string;

  @ApiPropertyOptional({ enum: ContentWidth })
  @IsOptional()
  @IsEnum(ContentWidth)
  contentWidth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showHero?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showFeatures?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPosts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBenefits?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTestimonials?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showStats?: boolean;

  @ApiPropertyOptional({
    description: 'Custom domain without protocol/path. Example: ai.chabaqa.io',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    const normalized = toOptionalTrimmedString(value);
    return normalized ? normalized.toLowerCase() : undefined;
  })
  @ValidateIf((_, value) => value !== '')
  @Matches(CUSTOM_DOMAIN_REGEX, {
    message: 'customDomain must be a valid hostname without protocol or path',
  })
  customDomain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(10000)
  headerScripts?: string;

  @ApiPropertyOptional({ type: UpdateCommunitySocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCommunitySocialLinksDto)
  socialLinks?: UpdateCommunitySocialLinksDto;
}

export class UpdateCommunityCustomizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(5000)
  longDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(1000)
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MaxLength(1000)
  logo?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  price?: number;

  @ApiPropertyOptional({ enum: CommunityPriceType })
  @IsOptional()
  @IsEnum(CommunityPriceType)
  priceType?: string;

  @ApiPropertyOptional({ enum: CommunityType })
  @IsOptional()
  @IsEnum(CommunityType)
  type?: string;

  @ApiPropertyOptional({ type: UpdateCommunitySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCommunitySettingsDto)
  settings?: UpdateCommunitySettingsDto;
}

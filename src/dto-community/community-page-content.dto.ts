import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { 
  IsString, 
  IsBoolean, 
  IsOptional, 
  IsArray, 
  ValidateNested, 
  IsNumber, 
  Min, 
  Max, 
  IsNotEmpty,
  IsHexColor,
  IsUrl
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Overview Card
 */
export class OverviewCardDto {
  @ApiProperty({ description: 'Unique ID for the card' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Card title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Card description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Icon (emoji or icon name)' })
  @IsString()
  @IsNotEmpty()
  icon: string;

  @ApiProperty({ description: 'Icon background color (hex)', example: '#3B82F6' })
  @IsHexColor()
  iconColor: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsNumber()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}

/**
 * DTO for Benefit Item
 */
export class BenefitItemDto {
  @ApiProperty({ description: 'Unique ID for the benefit' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Benefit title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Benefit description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Icon (emoji or icon name)' })
  @IsString()
  @IsNotEmpty()
  icon: string;

  @ApiProperty({ description: 'Icon background color (hex)', example: '#8B5CF6' })
  @IsHexColor()
  iconColor: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsNumber()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}

/**
 * DTO for Testimonial
 */
export class TestimonialDto {
  @ApiProperty({ description: 'Unique ID for the testimonial' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Person name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Person role/title' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ description: 'Avatar URL' })
  @IsUrl()
  @IsNotEmpty()
  avatar: string;

  @ApiProperty({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ description: 'Testimonial content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsNumber()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}

/**
 * DTO for Hero Section
 */
export class HeroSectionDto {
  @ApiPropertyOptional({ description: 'Custom title (overrides community name)' })
  @IsString()
  @IsOptional()
  customTitle?: string;

  @ApiPropertyOptional({ description: 'Custom subtitle' })
  @IsString()
  @IsOptional()
  customSubtitle?: string;

  @ApiPropertyOptional({ description: 'Custom banner URL' })
  @IsUrl()
  @IsOptional()
  customBanner?: string;

  @ApiPropertyOptional({ description: 'CTA button text', default: 'Join Community' })
  @IsString()
  @IsOptional()
  ctaButtonText?: string;

  @ApiPropertyOptional({ description: 'Show member count', default: true })
  @IsBoolean()
  @IsOptional()
  showMemberCount?: boolean;

  @ApiPropertyOptional({ description: 'Show rating', default: true })
  @IsBoolean()
  @IsOptional()
  showRating?: boolean;

  @ApiPropertyOptional({ description: 'Show creator info', default: true })
  @IsBoolean()
  @IsOptional()
  showCreator?: boolean;
}

/**
 * DTO for Overview Section
 */
export class OverviewSectionDto {
  @ApiPropertyOptional({ description: 'Section title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Section subtitle' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Overview cards', type: [OverviewCardDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverviewCardDto)
  @IsOptional()
  cards?: OverviewCardDto[];

  @ApiPropertyOptional({ description: 'Section visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}

/**
 * DTO for Benefits Section
 */
export class BenefitsSectionDto {
  @ApiPropertyOptional({ description: 'Title prefix' })
  @IsString()
  @IsOptional()
  titlePrefix?: string;

  @ApiPropertyOptional({ description: 'Title suffix' })
  @IsString()
  @IsOptional()
  titleSuffix?: string;

  @ApiPropertyOptional({ description: 'Section subtitle' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Benefits list', type: [BenefitItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BenefitItemDto)
  @IsOptional()
  benefits?: BenefitItemDto[];

  @ApiPropertyOptional({ description: 'CTA title' })
  @IsString()
  @IsOptional()
  ctaTitle?: string;

  @ApiPropertyOptional({ description: 'CTA subtitle' })
  @IsString()
  @IsOptional()
  ctaSubtitle?: string;

  @ApiPropertyOptional({ description: 'Section visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}

/**
 * DTO for Testimonials Section
 */
export class TestimonialsSectionDto {
  @ApiPropertyOptional({ description: 'Section title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Section subtitle' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Testimonials list', type: [TestimonialDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestimonialDto)
  @IsOptional()
  testimonials?: TestimonialDto[];

  @ApiPropertyOptional({ description: 'Section visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;

  @ApiPropertyOptional({ description: 'Show ratings', default: true })
  @IsBoolean()
  @IsOptional()
  showRatings?: boolean;
}

/**
 * DTO for CTA Section
 */
export class CTASectionDto {
  @ApiPropertyOptional({ description: 'CTA title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'CTA subtitle' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Button text' })
  @IsString()
  @IsOptional()
  buttonText?: string;

  @ApiPropertyOptional({ description: 'Section visibility', default: true })
  @IsBoolean()
  @IsOptional()
  visible?: boolean;

  @ApiPropertyOptional({ description: 'Custom background URL' })
  @IsUrl()
  @IsOptional()
  customBackground?: string;
}

/**
 * DTO for Creating/Updating Community Page Content
 */
export class UpdateCommunityPageContentDto {
  @ApiPropertyOptional({ description: 'Hero section configuration' })
  @ValidateNested()
  @Type(() => HeroSectionDto)
  @IsOptional()
  hero?: HeroSectionDto;

  @ApiPropertyOptional({ description: 'Overview section configuration' })
  @ValidateNested()
  @Type(() => OverviewSectionDto)
  @IsOptional()
  overview?: OverviewSectionDto;

  @ApiPropertyOptional({ description: 'Benefits section configuration' })
  @ValidateNested()
  @Type(() => BenefitsSectionDto)
  @IsOptional()
  benefits?: BenefitsSectionDto;

  @ApiPropertyOptional({ description: 'Testimonials section configuration' })
  @ValidateNested()
  @Type(() => TestimonialsSectionDto)
  @IsOptional()
  testimonials?: TestimonialsSectionDto;

  @ApiPropertyOptional({ description: 'CTA section configuration' })
  @ValidateNested()
  @Type(() => CTASectionDto)
  @IsOptional()
  cta?: CTASectionDto;
}

/**
 * DTO for Publishing Content
 */
export class PublishContentDto {
  @ApiProperty({ description: 'Publish or unpublish the content' })
  @IsBoolean()
  isPublished: boolean;
}

/**
 * DTO for Adding a Single Testimonial (with base64 image upload)
 */
export class AddTestimonialDto {
  @ApiProperty({ description: 'Person name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Person role/title' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ description: 'Base64 encoded avatar image' })
  @IsString()
  @IsNotEmpty()
  base64Avatar: string;

  @ApiProperty({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ description: 'Testimonial content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsNumber()
  @IsOptional()
  order?: number;
}

/**
 * DTO for Response
 */
export class CommunityPageContentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  communityId: string;

  @ApiProperty()
  hero: HeroSectionDto;

  @ApiProperty()
  overview: OverviewSectionDto;

  @ApiProperty()
  benefits: BenefitsSectionDto;

  @ApiProperty()
  testimonials: TestimonialsSectionDto;

  @ApiProperty()
  cta: CTASectionDto;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty()
  version: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

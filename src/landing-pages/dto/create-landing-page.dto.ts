import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsMongoId,
  ValidateNested,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SeoDto {
  @IsString()
  @IsOptional()
  @MaxLength(70)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  description?: string;

  @IsArray()
  @IsOptional()
  keywords?: string[];

  @IsString()
  @IsOptional()
  ogImage?: string;

  @IsBoolean()
  @IsOptional()
  noIndex?: boolean;
}

export class CreateLandingPageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, and hyphens',
  })
  @MaxLength(100)
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsMongoId()
  @IsOptional()
  communityId?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(standalone|community-home|funnel-step)$/, {
    message: 'pageType must be standalone, community-home, or funnel-step',
  })
  pageType?: string;

  @IsBoolean()
  @IsOptional()
  isPrimaryHome?: boolean;

  @IsString()
  @IsOptional()
  templateId?: string;

  @ValidateNested()
  @Type(() => SeoDto)
  @IsOptional()
  seo?: SeoDto;
}

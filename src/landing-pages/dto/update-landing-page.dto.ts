import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SeoDto } from './create-landing-page.dto';

export class UpdateLandingPageDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

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

  @IsArray()
  @IsOptional()
  blocks?: Record<string, any>[];

  @ValidateNested()
  @Type(() => SeoDto)
  @IsOptional()
  seo?: SeoDto;

  @IsString()
  @IsOptional()
  favicon?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsOptional()
  settings?: {
    passwordProtected?: boolean;
    password?: string;
    trackingPixels?: {
      meta?: string;
      google?: string;
    };
  };

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
  @Matches(/^(draft|published|archived)$/, {
    message: 'status must be draft, published, or archived',
  })
  status?: string;
}

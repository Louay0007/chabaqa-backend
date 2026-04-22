import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateUserSocialLinksDto {
  @ApiPropertyOptional({ example: 'https://instagram.com/johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien Instagram doit être une URL valide (http/https)' })
  readonly instagram?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien Facebook doit être une URL valide (http/https)' })
  readonly facebook?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien LinkedIn doit être une URL valide (http/https)' })
  readonly linkedin?: string;

  @ApiPropertyOptional({ example: 'https://x.com/johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien X/Twitter doit être une URL valide (http/https)' })
  readonly twitter?: string;

  @ApiPropertyOptional({ example: 'https://youtube.com/@johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien YouTube doit être une URL valide (http/https)' })
  readonly youtube?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/@johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien TikTok doit être une URL valide (http/https)' })
  readonly tiktok?: string;

  @ApiPropertyOptional({ example: 'https://github.com/johndoe', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le lien GitHub doit être une URL valide (http/https)' })
  readonly github?: string;

  @ApiPropertyOptional({ example: 'https://johndoe.com', format: 'uri' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
  @IsUrl({ require_protocol: true }, { message: 'Le site web doit être une URL valide (http/https)' })
  readonly website?: string;
}

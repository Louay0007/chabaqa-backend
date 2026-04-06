import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class PublishLandingPageDto {
  @IsString()
  @IsOptional()
  customDomain?: string;

  @IsBoolean()
  @IsOptional()
  passwordProtected?: boolean;

  @IsString()
  @IsOptional()
  password?: string;
}

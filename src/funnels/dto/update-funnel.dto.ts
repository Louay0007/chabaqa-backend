import { IsString, IsOptional, MinLength, MaxLength, IsArray, IsEnum } from 'class-validator';

export class UpdateFunnelDto {
  @IsString() @IsOptional() @MinLength(2) @MaxLength(200) name?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsEnum(['draft','active','paused','archived']) @IsOptional() status?: string;
  @IsArray() @IsOptional() steps?: Record<string, any>[];
  @IsArray() @IsOptional() connections?: Record<string, any>[];
}

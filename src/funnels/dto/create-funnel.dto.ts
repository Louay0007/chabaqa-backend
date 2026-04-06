import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, IsArray } from 'class-validator';

export class CreateFunnelDto {
  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(200) name: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsArray() @IsOptional() steps?: Record<string, any>[];
  @IsArray() @IsOptional() connections?: Record<string, any>[];
}

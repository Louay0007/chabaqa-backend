import { IsString, IsOptional, IsEmail, IsObject, IsNotEmpty } from 'class-validator';

export class SubmitLeadDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;

  @IsString()
  @IsOptional()
  source?: string;
}

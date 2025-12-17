import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional, IsDateString } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  readonly name: string;

  @IsEmail()
  @IsNotEmpty()
  readonly email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  readonly password: string;

  @IsString()
  @IsNotEmpty()
  readonly role: string;

  @IsOptional()
  @IsString()
  readonly numtel?: string;

  @IsOptional()
  @IsDateString()
  readonly date_naissance?: string;

  @IsOptional()
  @IsString()
  readonly sexe?: string;

  @IsOptional()
  @IsString()
  readonly pays?: string;

  @IsOptional()
  @IsString()
  readonly ville?: string;

  @IsOptional()
  @IsString()
  readonly code_postal?: string;

  @IsOptional()
  @IsString()
  readonly adresse?: string;

  @IsOptional()
  @IsString()
  readonly photo_profil?: string;

  @IsOptional()
  @IsString()
  readonly poste?: string;

  @IsOptional()
  @IsString()
  readonly departement?: string;
}
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO pour rejoindre une communauté directement par ID
 */
export class JoinCommunityDto {
  @ApiProperty({
    description: 'ID de la communauté à rejoindre',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Message optionnel de présentation',
    example: 'Bonjour, je souhaite rejoindre votre communauté pour apprendre et partager.',
    required: false
  })
  @IsString()
  @IsOptional()
  message?: string;
}

/**
 * DTO pour rejoindre une communauté via un lien d'invitation
 */
export class JoinByInviteDto {
  @ApiProperty({
    description: 'Code d\'invitation unique',
    example: 'abc123DEF456'
  })
  @IsString()
  @IsNotEmpty()
  inviteCode: string;

  @ApiProperty({
    description: 'Message optionnel de présentation',
    example: 'Bonjour, je viens via le lien d\'invitation.',
    required: false
  })
  @IsString()
  @IsOptional()
  message?: string;
}

/**
 * DTO pour générer un lien d'invitation
 */
export class GenerateInviteDto {
  @ApiProperty({
    description: 'ID de la communauté',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({
    description: 'Regénérer un nouveau code si un existe déjà',
    example: false,
    default: false,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  regenerate?: boolean;
} 
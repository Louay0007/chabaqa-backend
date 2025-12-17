import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO pour rejoindre un défi
 */
export class JoinChallengeDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;
}

/**
 * DTO pour quitter un défi
 */
export class LeaveChallengeDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;
}

/**
 * DTO pour mettre à jour le progrès d'un participant
 */
export class UpdateProgressDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiProperty({ description: 'ID de la tâche', example: 'task_456' })
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({ 
    description: 'Statut de la tâche', 
    example: 'completed',
    enum: ['completed', 'in_progress', 'not_started']
  })
  @IsEnum(['completed', 'in_progress', 'not_started'])
  status: 'completed' | 'in_progress' | 'not_started';
}

/**
 * DTO pour créer un post dans un défi
 */
export class CreateChallengePostDto {
  @ApiProperty({ description: 'Contenu du post', example: 'J\'ai terminé la première tâche !' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'Images du post', example: ['image1.jpg', 'image2.jpg'] })
  @IsString({ each: true })
  images?: string[];
}

/**
 * DTO pour commenter un post de défi
 */
export class CreateChallengeCommentDto {
  @ApiProperty({ description: 'Contenu du commentaire', example: 'Excellent travail !' })
  @IsString()
  @IsNotEmpty()
  content: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO pour activer/désactiver la progression séquentielle d'un défi
 */
export class UpdateChallengeSequentialProgressionDto {
  @ApiProperty({
    description: 'Activer ou désactiver la progression séquentielle',
    example: true
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: 'Message personnalisé affiché quand une tâche est verrouillée',
    example: 'Complétez la tâche précédente pour débloquer cette étape',
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  unlockMessage?: string;
}

/**
 * DTO pour la réponse de vérification d'accès à une tâche
 */
export class TaskAccessResponseDto {
  @ApiProperty({
    description: 'Indique si l\'utilisateur a accès à la tâche',
    example: true
  })
  hasAccess: boolean;

  @ApiProperty({
    description: 'Raison de l\'accès ou du refus',
    example: 'previous_completed',
    enum: ['sequential_disabled', 'first_task', 'previous_completed', 'previous_not_completed']
  })
  reason: string;

  @ApiProperty({
    description: 'Tâche requise pour débloquer l\'accès',
    required: false
  })
  requiredTask?: {
    id: string;
    title: string;
    day: number;
  };

  @ApiProperty({
    description: 'Message de déverrouillage personnalisé',
    required: false
  })
  unlockMessage?: string;

  @ApiProperty({
    description: 'Tâche suivante disponible',
    required: false
  })
  nextTask?: {
    id: string;
    title: string;
    day: number;
  };
}

/**
 * DTO pour obtenir les tâches déverrouillées
 */
export class UnlockedTasksResponseDto {
  @ApiProperty({
    description: 'Liste des tâches déverrouillées pour l\'utilisateur',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        day: { type: 'number' },
        isCompleted: { type: 'boolean' },
        isUnlocked: { type: 'boolean' }
      }
    }
  })
  unlockedTasks: Array<{
    id: string;
    title: string;
    day: number;
    isCompleted: boolean;
    isUnlocked: boolean;
  }>;

  @ApiProperty({
    description: 'Progression séquentielle activée',
    example: true
  })
  sequentialProgressionEnabled: boolean;

  @ApiProperty({
    description: 'Message de déverrouillage personnalisé',
    required: false
  })
  unlockMessage?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO pour activer/désactiver la progression séquentielle d'un cours
 */
export class UpdateSequentialProgressionDto {
  @ApiProperty({
    description: 'Activer ou désactiver la progression séquentielle',
    example: true
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: 'Message personnalisé affiché quand un chapitre est verrouillé',
    example: 'Complétez le chapitre précédent pour débloquer ce contenu',
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  unlockMessage?: string;
}

/**
 * DTO pour la réponse de vérification d'accès à un chapitre
 */
export class ChapterAccessResponseDto {
  @ApiProperty({
    description: 'Indique si l\'utilisateur a accès au chapitre',
    example: true
  })
  hasAccess: boolean;

  @ApiProperty({
    description: 'Raison de l\'accès ou du refus',
    example: 'previous_completed',
    enum: ['sequential_disabled', 'first_chapter', 'previous_completed', 'previous_not_completed']
  })
  reason: string;

  @ApiProperty({
    description: 'Chapitre requis pour débloquer l\'accès',
    required: false
  })
  requiredChapter?: {
    id: string;
    titre: string;
    ordre: number;
    sectionId: string;
  };

  @ApiProperty({
    description: 'Message de déverrouillage personnalisé',
    required: false
  })
  unlockMessage?: string;

  @ApiProperty({
    description: 'Chapitre suivant disponible',
    required: false
  })
  nextChapter?: {
    id: string;
    titre: string;
    ordre: number;
    sectionId: string;
  };
}

/**
 * DTO pour obtenir les chapitres déverrouillés
 */
export class UnlockedChaptersResponseDto {
  @ApiProperty({
    description: 'Liste des chapitres déverrouillés pour l\'utilisateur',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        titre: { type: 'string' },
        ordre: { type: 'number' },
        sectionId: { type: 'string' },
        sectionTitre: { type: 'string' },
        isCompleted: { type: 'boolean' },
        isUnlocked: { type: 'boolean' }
      }
    }
  })
  unlockedChapters: Array<{
    id: string;
    titre: string;
    ordre: number;
    sectionId: string;
    sectionTitre: string;
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

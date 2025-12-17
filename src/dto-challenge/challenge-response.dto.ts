import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour une ressource de défi
 */
export class ChallengeResourceResponseDto {
  @ApiProperty({ description: 'ID de la ressource', example: 'resource_123' })
  id: string;

  @ApiProperty({ description: 'Titre de la ressource', example: 'Guide HTML5' })
  title: string;

  @ApiProperty({ description: 'Type de ressource', example: 'video' })
  type: 'video' | 'article' | 'code' | 'tool' | 'pdf' | 'link';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/guide.pdf' })
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Guide complet sur HTML5' })
  description: string;

  @ApiProperty({ description: 'Ordre d\'affichage', example: 1 })
  order: number;
}

/**
 * DTO de réponse pour une ressource de tâche
 */
export class ChallengeTaskResourceResponseDto {
  @ApiProperty({ description: 'ID de la ressource', example: 'task_resource_123' })
  id: string;

  @ApiProperty({ description: 'Titre de la ressource', example: 'Tutoriel CSS' })
  title: string;

  @ApiProperty({ description: 'Type de ressource', example: 'video' })
  type: 'video' | 'article' | 'code' | 'tool';

  @ApiProperty({ description: 'URL de la ressource', example: 'https://example.com/tutorial.mp4' })
  url: string;

  @ApiProperty({ description: 'Description de la ressource', example: 'Tutoriel vidéo sur CSS' })
  description: string;
}

/**
 * DTO de réponse pour une tâche de défi
 */
export class ChallengeTaskResponseDto {
  @ApiProperty({ description: 'ID de la tâche', example: 'task_123' })
  id: string;

  @ApiProperty({ description: 'Jour de la tâche', example: 1 })
  day: number;

  @ApiProperty({ description: 'Titre de la tâche', example: 'Créer une page HTML' })
  title: string;

  @ApiProperty({ description: 'Description de la tâche', example: 'Créer une page HTML avec les éléments sémantiques' })
  description: string;

  @ApiProperty({ description: 'Livrable attendu', example: 'Page HTML avec header, nav, main, footer' })
  deliverable: string;

  @ApiProperty({ description: 'Si la tâche est complétée', example: false })
  isCompleted: boolean;

  @ApiProperty({ description: 'Si la tâche est active', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Points attribués', example: 100 })
  points: number;

  @ApiProperty({ description: 'Instructions détaillées', example: 'Utilisez les balises sémantiques HTML5...' })
  instructions: string;

  @ApiPropertyOptional({ description: 'Notes supplémentaires' })
  notes?: string;

  @ApiProperty({ description: 'Ressources de la tâche', type: [ChallengeTaskResourceResponseDto] })
  resources: ChallengeTaskResourceResponseDto[];

  @ApiProperty({ description: 'Date de création', example: '2024-02-01T00:00:00.000Z' })
  createdAt: string;
}

/**
 * DTO de réponse pour un participant de défi
 */
export class ChallengeParticipantResponseDto {
  @ApiProperty({ description: 'ID du participant', example: 'participant_123' })
  id: string;

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  userId: string;

  @ApiProperty({ description: 'Nom de l\'utilisateur', example: 'John Doe' })
  userName: string;

  @ApiPropertyOptional({ description: 'Avatar de l\'utilisateur', example: 'https://example.com/avatar.jpg' })
  userAvatar?: string;

  @ApiProperty({ description: 'Date d\'inscription', example: '2024-02-01T00:00:00.000Z' })
  joinedAt: string;

  @ApiProperty({ description: 'Si le participant est actif', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Progrès en pourcentage', example: 65 })
  progress: number;

  @ApiProperty({ description: 'Points totaux', example: 250 })
  totalPoints: number;

  @ApiProperty({ description: 'Tâches complétées', example: ['task_1', 'task_2'] })
  completedTasks: string[];

  @ApiProperty({ description: 'Dernière activité', example: '2024-02-15T10:30:00.000Z' })
  lastActivityAt: string;
}

/**
 * DTO de réponse pour un commentaire de post de défi
 */
export class ChallengeCommentResponseDto {
  @ApiProperty({ description: 'ID du commentaire', example: 'comment_123' })
  id: string;

  @ApiProperty({ description: 'Contenu du commentaire', example: 'Excellent travail !' })
  content: string;

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  userId: string;

  @ApiProperty({ description: 'Nom de l\'utilisateur', example: 'John Doe' })
  userName: string;

  @ApiPropertyOptional({ description: 'Avatar de l\'utilisateur', example: 'https://example.com/avatar.jpg' })
  userAvatar?: string;

  @ApiProperty({ description: 'Date de création', example: '2024-02-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-01T00:00:00.000Z' })
  updatedAt: string;
}

/**
 * DTO de réponse pour un post de défi
 */
export class ChallengePostResponseDto {
  @ApiProperty({ description: 'ID du post', example: 'post_123' })
  id: string;

  @ApiProperty({ description: 'Contenu du post', example: 'J\'ai terminé la première tâche !' })
  content: string;

  @ApiProperty({ description: 'Images du post', example: ['image1.jpg', 'image2.jpg'] })
  images: string[];

  @ApiProperty({ description: 'ID de l\'utilisateur', example: 'user_456' })
  userId: string;

  @ApiProperty({ description: 'Nom de l\'utilisateur', example: 'John Doe' })
  userName: string;

  @ApiPropertyOptional({ description: 'Avatar de l\'utilisateur', example: 'https://example.com/avatar.jpg' })
  userAvatar?: string;

  @ApiProperty({ description: 'Nombre de likes', example: 15 })
  likes: number;

  @ApiProperty({ description: 'Commentaires du post', type: [ChallengeCommentResponseDto] })
  comments: ChallengeCommentResponseDto[];

  @ApiProperty({ description: 'Date de création', example: '2024-02-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-01T00:00:00.000Z' })
  updatedAt: string;
}

/**
 * DTO de réponse pour un défi
 */
export class ChallengeResponseDto {
  @ApiProperty({ description: 'ID du défi', example: 'challenge_123' })
  id: string;

  @ApiProperty({ description: 'Titre du défi', example: '30-Day Coding Challenge' })
  title: string;

  @ApiProperty({ description: 'Description du défi', example: 'Un défi de 30 jours pour apprendre le développement web' })
  description: string;

  @ApiProperty({ description: 'ID de la communauté', example: 'community_456' })
  communityId: string;

  @ApiProperty({ description: 'Slug de la communauté', example: 'web-dev-community' })
  communitySlug: string;

  @ApiProperty({ description: 'ID du créateur', example: 'user_789' })
  creatorId: string;

  @ApiProperty({ description: 'Nom du créateur', example: 'Jane Smith' })
  creatorName: string;

  @ApiPropertyOptional({ description: 'Avatar du créateur', example: 'https://example.com/avatar.jpg' })
  creatorAvatar?: string;

  @ApiProperty({ description: 'Date de début', example: '2024-02-01T00:00:00.000Z' })
  startDate: string;

  @ApiProperty({ description: 'Date de fin', example: '2024-03-01T23:59:59.000Z' })
  endDate: string;

  @ApiProperty({ description: 'Si le défi est actif', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Participants du défi', type: [ChallengeParticipantResponseDto] })
  participants: ChallengeParticipantResponseDto[];

  @ApiProperty({ description: 'Posts du défi', type: [ChallengePostResponseDto] })
  posts: ChallengePostResponseDto[];

  @ApiProperty({ description: 'Date de création', example: '2024-01-15T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ description: 'Date de mise à jour', example: '2024-02-01T00:00:00.000Z' })
  updatedAt: string;

  @ApiPropertyOptional({ description: 'Montant de dépôt requis', example: 50 })
  depositAmount?: number;

  @ApiPropertyOptional({ description: 'Nombre maximum de participants', example: 100 })
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Récompense de completion', example: 25 })
  completionReward?: number;

  @ApiPropertyOptional({ description: 'Bonus pour le meilleur performer', example: 100 })
  topPerformerBonus?: number;

  @ApiPropertyOptional({ description: 'Bonus de streak', example: 10 })
  streakBonus?: number;

  @ApiPropertyOptional({ description: 'Catégorie du défi', example: 'Web Development' })
  category?: string;

  @ApiPropertyOptional({ description: 'Difficulté du défi', example: 'beginner' })
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Durée du défi', example: '30 days' })
  duration?: string;

  @ApiPropertyOptional({ description: 'Image miniature du défi', example: 'https://example.com/challenge.jpg' })
  thumbnail?: string;

  @ApiPropertyOptional({ description: 'Notes additionnelles' })
  notes?: string;

  @ApiProperty({ description: 'Ressources du défi', type: [ChallengeResourceResponseDto] })
  resources: ChallengeResourceResponseDto[];

  @ApiProperty({ description: 'Tâches du défi', type: [ChallengeTaskResponseDto] })
  tasks: ChallengeTaskResponseDto[];

  @ApiProperty({ description: 'Nombre de participants', example: 25 })
  participantCount: number;

  @ApiProperty({ description: 'Si le défi est en cours', example: true })
  isOngoing: boolean;

  @ApiProperty({ description: 'Si le défi est terminé', example: false })
  isCompleted: boolean;

  // ============= PRICING FIELDS =============

  @ApiPropertyOptional({ description: 'Prix de participation au défi', example: 99 })
  participationFee?: number;

  @ApiPropertyOptional({ description: 'Devise du prix', example: 'USD' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Si un dépôt est requis', example: true })
  depositRequired?: boolean;

  @ApiPropertyOptional({ description: 'Si le défi est premium', example: false })
  isPremium?: boolean;

  @ApiPropertyOptional({ 
    description: 'Fonctionnalités premium', 
    type: 'object',
    additionalProperties: false,
    properties: {
      personalMentoring: { type: 'boolean' },
      exclusiveResources: { type: 'boolean' },
      priorityFeedback: { type: 'boolean' },
      certificate: { type: 'boolean' },
      liveSessions: { type: 'boolean' },
      communityAccess: { type: 'boolean' }
    }
  })
  premiumFeatures?: {
    personalMentoring: boolean;
    exclusiveResources: boolean;
    priorityFeedback: boolean;
    certificate: boolean;
    liveSessions: boolean;
    communityAccess: boolean;
  };

  @ApiPropertyOptional({ 
    description: 'Options de paiement', 
    type: 'object',
    additionalProperties: false,
    properties: {
      allowInstallments: { type: 'boolean' },
      installmentCount: { type: 'number' },
      earlyBirdDiscount: { type: 'number' },
      groupDiscount: { type: 'number' },
      memberDiscount: { type: 'number' }
    }
  })
  paymentOptions?: {
    allowInstallments: boolean;
    installmentCount?: number;
    earlyBirdDiscount?: number;
    groupDiscount?: number;
    memberDiscount?: number;
  };

  @ApiPropertyOptional({ description: 'Jours d\'essai gratuit', example: 7 })
  freeTrialDays?: number;

  @ApiPropertyOptional({ description: 'Fonctionnalités disponibles pendant l\'essai', type: [String] })
  trialFeatures?: string[];

  @ApiProperty({ description: 'Si le défi est gratuit', example: false })
  isFree: boolean;

  @ApiProperty({ description: 'Prix final après remises', example: 79 })
  finalPrice?: number;
}

/**
 * DTO de réponse pour la liste des défis
 */
export class ChallengeListResponseDto {
  @ApiProperty({ description: 'Liste des défis', type: [ChallengeResponseDto] })
  challenges: ChallengeResponseDto[];

  @ApiProperty({ description: 'Nombre total de défis', example: 50 })
  total: number;

  @ApiProperty({ description: 'Page actuelle', example: 1 })
  page: number;

  @ApiProperty({ description: 'Nombre d\'éléments par page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Nombre total de pages', example: 5 })
  totalPages: number;
}

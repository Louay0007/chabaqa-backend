import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour un commentaire de post
 */
export class PostCommentResponseDto {
  @ApiProperty({
    description: 'ID unique du commentaire',
    example: 'comment_123'
  })
  id: string;

  @ApiProperty({
    description: 'Contenu du commentaire',
    example: 'Excellent article, merci pour le partage !'
  })
  content: string;

  @ApiProperty({
    description: 'ID de l\'utilisateur qui a commenté',
    example: 'user_456'
  })
  userId: string;

  @ApiProperty({
    description: 'Nom de l\'utilisateur qui a commenté',
    example: 'John Doe'
  })
  userName: string;

  @ApiPropertyOptional({
    description: 'Avatar de l\'utilisateur qui a commenté',
    example: 'https://example.com/avatar.jpg'
  })
  userAvatar?: string;

  @ApiPropertyOptional({
    description: 'ID du commentaire parent (si c\'est une réponse)',
    example: 'comment_parent_123'
  })
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Réponses du commentaire',
    type: 'array',
    items: {
      type: 'object',
    }
  })
  replies?: PostCommentResponseDto[];

  @ApiProperty({
    description: 'Date de création du commentaire',
    example: '2024-02-10T10:30:00.000Z'
  })
  createdAt: string;

  @ApiProperty({
    description: 'Date de dernière modification du commentaire',
    example: '2024-02-10T10:30:00.000Z'
  })
  updatedAt: string;
}

export class PostReactionResponseDto {
  @ApiProperty({
    description: 'Emoji de la réaction',
    example: '👍'
  })
  emoji: string;

  @ApiProperty({
    description: 'Nombre d\'utilisateurs ayant cette réaction',
    example: 12
  })
  count: number;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a cette réaction',
    example: false
  })
  usersIncludeMe: boolean;
}

/**
 * DTO de réponse pour un post
 */
export class PostResponseDto {
  @ApiProperty({
    description: 'ID unique du post',
    example: 'post_123'
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Titre du post (optionnel)',
    example: 'Getting Started with React Hooks'
  })
  title?: string;

  @ApiProperty({
    description: 'Contenu principal du post',
    example: 'React Hooks have revolutionized how we write React components...'
  })
  content: string;

  @ApiPropertyOptional({
    description: 'Extrait du post',
    example: 'Learn the fundamentals of React Hooks and how they can simplify your code.'
  })
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image miniature',
    example: 'https://example.com/thumbnail.jpg'
  })
  thumbnail?: string;

  @ApiProperty({
    description: 'ID de la communauté',
    example: 'community_123'
  })
  communityId: string;

  @ApiProperty({
    description: 'Informations de la communauté',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'community_123' },
      name: { type: 'string', example: 'Web Development Community' },
      slug: { type: 'string', example: 'web-dev-community' }
    }
  })
  community: {
    id: string;
    name: string;
    slug: string;
  };

  @ApiProperty({
    description: 'ID de l\'auteur du post',
    example: 'user_456'
  })
  authorId: string;

  @ApiProperty({
    description: 'Informations de l\'auteur',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'user_456' },
      name: { type: 'string', example: 'John Doe' },
      email: { type: 'string', example: 'john@example.com' },
      profile_picture: { type: 'string', example: 'https://example.com/avatar.jpg' }
    }
  })
  author: {
    id: string;
    name: string;
    email: string;
    profile_picture?: string;
  };

  @ApiProperty({
    description: 'Indique si le post est publié',
    example: true
  })
  isPublished: boolean;

  @ApiProperty({
    description: 'Nombre de likes du post',
    example: 45
  })
  likes: number;

  @ApiPropertyOptional({
    description: 'Réactions du post',
    type: [PostReactionResponseDto]
  })
  reactions?: PostReactionResponseDto[];

  @ApiProperty({
    description: 'Nombre de commentaires du post',
    example: 10
  })
  commentsCount: number;

  @ApiProperty({
    description: 'Nombre de partages du post',
    example: 12
  })
  shareCount: number;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a liké le post',
    example: false
  })
  isLikedByUser: boolean;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a partagé le post',
    example: false
  })
  isSharedByUser: boolean;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a ajouté le post aux favoris',
    example: false
  })
  isBookmarkedByUser: boolean;

  @ApiProperty({
    description: 'Indique si le post est épinglé',
    example: false
  })
  isPinned: boolean;

  @ApiPropertyOptional({
    description: 'Date d\'épinglage du post',
    example: '2024-02-10T10:00:00.000Z'
  })
  pinnedAt?: string;

  @ApiProperty({
    description: 'Commentaires du post',
    type: [PostCommentResponseDto]
  })
  comments: PostCommentResponseDto[];

  @ApiProperty({
    description: 'Tags du post',
    example: ['react', 'hooks', 'javascript'],
    type: [String]
  })
  tags: string[];

  @ApiPropertyOptional({
    description: 'URLs des images attachées au post',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    type: [String]
  })
  images?: string[];

  @ApiPropertyOptional({
    description: 'URLs des vidéos attachées au post',
    example: ['https://example.com/video1.mp4'],
    type: [String]
  })
  videos?: string[];

  @ApiPropertyOptional({
    description: 'Liens attachés au post',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://example.com' },
        title: { type: 'string', example: 'Example Site' },
        description: { type: 'string', example: 'An example website' },
        thumbnail: { type: 'string', example: 'https://example.com/thumb.jpg' }
      }
    }
  })
  links?: { url: string; title?: string; description?: string; thumbnail?: string }[];

  @ApiProperty({
    description: 'Date de création du post',
    example: '2024-02-10T10:00:00.000Z'
  })
  createdAt: string;

  @ApiProperty({
    description: 'Date de dernière modification du post',
    example: '2024-02-10T10:00:00.000Z'
  })
  updatedAt: string;
}

/**
 * DTO de réponse pour la liste des posts
 */
export class PostListResponseDto {
  @ApiProperty({
    description: 'Liste des posts',
    type: [PostResponseDto]
  })
  posts: PostResponseDto[];

  @ApiProperty({
    description: 'Informations de pagination',
    type: 'object',
    properties: {
      page: { type: 'number', example: 1 },
      limit: { type: 'number', example: 10 },
      total: { type: 'number', example: 25 },
      totalPages: { type: 'number', example: 3 }
    }
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * DTO de réponse pour les statistiques d'un post
 */
export class PostStatsResponseDto {
  @ApiProperty({
    description: 'ID du post',
    example: 'post_123'
  })
  postId: string;

  @ApiProperty({
    description: 'Nombre total de likes',
    example: 45
  })
  totalLikes: number;

  @ApiProperty({
    description: 'Nombre total de partages',
    example: 12
  })
  totalShares: number;

  @ApiProperty({
    description: 'Nombre total de commentaires',
    example: 12
  })
  totalComments: number;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a liké le post',
    example: false
  })
  isLikedByUser: boolean;

  @ApiProperty({
    description: 'Indique si l\'utilisateur actuel a partagé le post',
    example: false
  })
  isSharedByUser: boolean;
}

class PostSharePlatformUrlsDto {
  @ApiProperty({ example: 'https://wa.me/?text=...' })
  whatsapp: string;

  @ApiProperty({ example: 'https://twitter.com/intent/tweet?text=...&url=...' })
  x: string;

  @ApiProperty({ example: 'https://www.facebook.com/sharer/sharer.php?u=...' })
  facebook: string;

  @ApiProperty({ example: 'https://www.linkedin.com/sharing/share-offsite/?url=...' })
  linkedin: string;

  @ApiProperty({ example: 'https://t.me/share/url?url=...&text=...' })
  telegram: string;

  @ApiProperty({ example: 'mailto:?subject=...&body=...' })
  email: string;
}

export class PostShareMetaResponseDto {
  @ApiProperty({ example: 'post_123' })
  postId: string;

  @ApiProperty({ example: 'https://chabaqa.io/Creator/community/home?post=post_123' })
  shareUrl: string;

  @ApiProperty({ example: 'Getting Started with React Hooks' })
  title: string;

  @ApiProperty({ example: 'Check out this post from Web Development Community' })
  text: string;

  @ApiProperty({ type: PostSharePlatformUrlsDto })
  platformUrls: PostSharePlatformUrlsDto;
}

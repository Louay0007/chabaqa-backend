import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de réponse pour une variante de produit
 */
export class ProductVariantResponseDto {
  @ApiProperty({
    description: 'ID unique de la variante',
    example: 'variant_123'
  })
  id: string;

  @ApiProperty({
    description: 'Nom de la variante',
    example: 'Taille L'
  })
  name: string;

  @ApiProperty({
    description: 'Prix de la variante',
    example: 29.99
  })
  price: number;

  @ApiPropertyOptional({
    description: 'Description de la variante',
    example: 'Variante avec des matériaux premium'
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Inventaire de la variante',
    example: 50
  })
  inventory?: number;
}

/**
 * DTO de réponse pour un fichier de produit
 */
export class ProductFileResponseDto {
  @ApiProperty({
    description: 'ID unique du fichier',
    example: 'file_123'
  })
  id: string;

  @ApiProperty({
    description: 'Nom du fichier',
    example: 'UI_Kit.fig'
  })
  name: string;

  @ApiProperty({
    description: 'URL du fichier',
    example: 'https://example.com/download/ui-kit'
  })
  url: string;

  @ApiProperty({
    description: 'Type de fichier',
    example: 'Figma'
  })
  type: string;

  @ApiPropertyOptional({
    description: 'Taille du fichier',
    example: '8.5MB'
  })
  size?: string;

  @ApiPropertyOptional({
    description: 'Description du fichier',
    example: 'Fichier principal du kit UI avec tous les composants'
  })
  description?: string;

  @ApiProperty({
    description: 'Ordre d\'affichage',
    example: 1
  })
  order: number;

  @ApiProperty({
    description: 'Nombre de téléchargements',
    example: 15
  })
  downloadCount: number;

  @ApiProperty({
    description: 'Indique si le fichier est actif',
    example: true
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Date d\'upload du fichier',
    example: '2024-02-10T10:00:00.000Z'
  })
  uploadedAt: string;
}

/**
 * DTO de réponse pour un produit
 */
export class ProductResponseDto {
  @ApiProperty({
    description: 'ID unique du produit',
    example: 'product_123'
  })
  id: string;

  @ApiProperty({
    description: 'Titre du produit',
    example: 'Cours de React Avancé'
  })
  title: string;

  @ApiProperty({
    description: 'Description du produit',
    example: 'Apprenez les concepts avancés de React avec des projets pratiques'
  })
  description: string;

  @ApiProperty({
    description: 'Prix du produit',
    example: 99.99
  })
  price: number;

  @ApiProperty({
    description: 'Devise du prix',
    example: 'USD'
  })
  currency: string;

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
    description: 'ID du créateur',
    example: 'user_456'
  })
  creatorId: string;

  @ApiProperty({
    description: 'Informations du créateur',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'user_456' },
      name: { type: 'string', example: 'John Doe' },
      email: { type: 'string', example: 'john@example.com' },
      avatar: { type: 'string', example: 'https://example.com/avatar.jpg' }
    }
  })
  creator: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };

  @ApiProperty({
    description: 'Indique si le produit est publié',
    example: true
  })
  isPublished: boolean;

  @ApiPropertyOptional({
    description: 'Inventaire du produit',
    example: 100
  })
  inventory?: number;

  @ApiProperty({
    description: 'Nombre de ventes',
    example: 25
  })
  sales: number;

  @ApiProperty({
    description: 'Catégorie du produit',
    example: 'Formation'
  })
  category: string;

  @ApiPropertyOptional({
    description: 'Type de produit',
    example: 'digital'
  })
  type?: 'digital' | 'physical';

  @ApiProperty({
    description: 'Images du produit',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    type: [String]
  })
  images: string[];

  @ApiPropertyOptional({
    description: 'Variantes du produit',
    type: [ProductVariantResponseDto]
  })
  variants?: ProductVariantResponseDto[];

  @ApiPropertyOptional({
    description: 'Fichiers du produit',
    type: [ProductFileResponseDto]
  })
  files?: ProductFileResponseDto[];

  @ApiPropertyOptional({
    description: 'Note moyenne du produit',
    example: 4.5,
    minimum: 0,
    maximum: 5
  })
  rating?: number;

  @ApiPropertyOptional({
    description: 'Termes de licence',
    example: 'Ce produit est sous licence MIT'
  })
  licenseTerms?: string;

  @ApiPropertyOptional({
    description: 'Indique si le produit est récurrent',
    example: false
  })
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description: 'Intervalle de récurrence',
    example: 'month'
  })
  recurringInterval?: 'month' | 'year' | 'week';

  @ApiPropertyOptional({
    description: 'Fonctionnalités du produit',
    example: ['Support 24/7', 'Accès à vie', 'Certificat'],
    type: [String]
  })
  features?: string[];

  @ApiProperty({
    description: 'Date de création',
    example: '2024-02-10T10:00:00.000Z'
  })
  createdAt: string;

  @ApiProperty({
    description: 'Date de dernière modification',
    example: '2024-02-10T10:00:00.000Z'
  })
  updatedAt: string;
}

/**
 * DTO de réponse pour la liste des produits
 */
export class ProductListResponseDto {
  @ApiProperty({
    description: 'Liste des produits',
    type: [ProductResponseDto]
  })
  products: ProductResponseDto[];

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
 * DTO de réponse pour les statistiques d'un produit
 */
export class ProductStatsResponseDto {
  @ApiProperty({
    description: 'ID du produit',
    example: 'product_123'
  })
  productId: string;

  @ApiProperty({
    description: 'Nombre total de ventes',
    example: 25
  })
  totalSales: number;

  @ApiProperty({
    description: 'Inventaire restant',
    example: 75
  })
  remainingInventory: number;

  @ApiProperty({
    description: 'Note moyenne',
    example: 4.5
  })
  averageRating: number;

  @ApiProperty({
    description: 'Nombre de variantes',
    example: 3
  })
  totalVariants: number;

  @ApiProperty({
    description: 'Nombre de fichiers',
    example: 5
  })
  totalFiles: number;
}

import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceService } from './resource.service';
import { CreateResourceDto, ResourceSummaryDto } from './dto/create-resource.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceType } from '../schema/resource.schema';

/**
 * Contrôleur pour la gestion des ressources
 */
@ApiTags('Resources')
@Controller('resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  /**
   * Obtenir toutes les ressources (endpoint simple)
   */
  @Get()
  @ApiOperation({ summary: 'Obtenir toutes les ressources' })
  @ApiResponse({ status: 200, description: 'Liste des ressources récupérée avec succès' })
  async getAllResources() {
    return this.resourceService.findAllPublishedSummary();
  }

  /**
   * Obtenir un résumé de toutes les ressources publiées (champs limités)
   */
  
  @Get('getAllResourcesSummary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir un résumé de toutes les ressources',
    description: 'Récupère la liste de toutes les ressources publiées avec seulement les informations essentielles (titre, description, type, readTime, catégorie)'
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des résumés de ressources récupérée avec succès',
    type: [ResourceSummaryDto]
  })
  async getAllResourcesSummary(): Promise<ResourceSummaryDto[]> {
    return await this.resourceService.findAllPublishedSummary() as ResourceSummaryDto[];
  }

  /**
   * Créer une nouvelle ressource (Admin uniquement)
   */
  @Post('create')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer une nouvelle ressource',
    description: 'Permet aux administrateurs de créer une nouvelle ressource (Article, Video, Guide). Le contenu s\'adapte automatiquement selon le type de ressource.'
  })
  @ApiBody({
    type: CreateResourceDto,
    description: 'Données de la ressource à créer',
    examples: {
      article: {
        summary: 'Exemple d\'article',
        value: {
          titre: 'Guide du créateur pour la création de communauté',
          description: 'Guide complet pour créer et développer votre communauté en ligne',
          type: 'Article',
          readTime: '15 min de lecture',
          category: 'Développement communautaire',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          content: {
            elements: [
              {
                type: 'text',
                content: 'Bienvenue dans ce guide complet...',
                title: 'Introduction',
                order: 1
              },
              {
                type: 'image',
                content: 'https://example.com/image.jpg',
                alt: 'Image du guide',
                caption: 'Exemple de communauté',
                order: 2
              }
            ],
            excerpt: 'Ce guide vous apprendra...',
            tags: ['communauté', 'création', 'guide']
          },
          tags: ['communauté', 'développement'],
          isPublished: true
        }
      },
      video: {
        summary: 'Exemple de vidéo',
        value: {
          titre: 'Comment monétiser sa communauté',
          description: 'Stratégies éprouvées pour générer des revenus',
          type: 'Video',
          readTime: '30 min de visionnage',
          category: 'Monétisation',
          content: {
            videoUrl: 'https://example.com/video.mp4',
            thumbnailUrl: 'https://example.com/thumbnail.jpg',
            duration: 1800,
            quality: 'HD',
            description: [
              {
                type: 'text',
                content: 'Dans cette vidéo, nous allons explorer...',
                order: 1
              }
            ]
          },
          isPublished: false
        }
      },
      guide: {
        summary: 'Exemple de guide',
        value: {
          titre: 'Guide complet du marketing communautaire',
          description: 'Apprenez à promouvoir votre communauté efficacement',
          type: 'Guide',
          readTime: '45 min de lecture',
          category: 'Marketing',
          content: {
            sections: [
              {
                title: 'Les bases du marketing communautaire',
                description: 'Comprendre les fondamentaux',
                order: 1,
                elements: [
                  {
                    type: 'text',
                    content: 'Le marketing communautaire est...',
                    order: 1
                  },
                  {
                    type: 'video',
                    content: 'https://example.com/intro-video.mp4',
                    title: 'Vidéo d\'introduction',
                    order: 2
                  }
                ]
              },
              {
                title: 'Stratégies avancées',
                order: 2,
                elements: [
                  {
                    type: 'text',
                    content: 'Pour aller plus loin...',
                    order: 1
                  }
                ]
              }
            ],
            introduction: [
              {
                type: 'text',
                content: 'Ce guide vous donnera toutes les clés...',
                order: 1
              }
            ],
            guideMetadata: {
              difficulty: 'Intermédiaire',
              prerequisites: ['Connaissances de base en marketing'],
              learningOutcomes: ['Créer une stratégie marketing', 'Mesurer les performances']
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Ressource créée avec succès',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        titre: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['Article', 'Video', 'Guide'] },
        readTime: { type: 'string' },
        category: { type: 'string' },
        author: { type: 'string' },
        authorName: { type: 'string' },
        isPublished: { type: 'boolean' },
        isFeature: { type: 'boolean' },
        isPremium: { type: 'boolean' },
        viewsCount: { type: 'number' },
        likesCount: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Données invalides: Un article doit contenir au moins un élément de contenu' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Non authentifié',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Vous devez être connecté pour effectuer cette action' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Accès refusé - Admin uniquement',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Seuls les administrateurs peuvent créer des ressources' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'Conflit - Slug déjà existant',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Une ressource avec ce slug existe déjà' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  async createResource(
    @Body() createResourceDto: CreateResourceDto,
    @Request() req: any
  ) {
    const { _id: authorId, name: authorName } = req.user;
    
    return await this.resourceService.createResource(
      createResourceDto,
      authorId,
      authorName
    );
  }

  /**
   * Obtenir toutes les ressources publiées
   */
  @Get('getAllPublishedResources')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir toutes les ressources publiées',
    description: 'Récupère la liste de toutes les ressources publiées, triées par date de création décroissante'
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des ressources récupérée avec succès'
  })
  async getAllPublishedResources() {
    return await this.resourceService.findAllPublished();
  }

  /**
   * Obtenir les ressources par type
   */
  @Get('type/:type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir les ressources par type',
    description: 'Récupère toutes les ressources publiées d\'un type spécifique'
  })
  @ApiParam({
    name: 'type',
    description: 'Type de ressource',
    enum: ResourceType
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des ressources du type spécifié'
  })
  @ApiResponse({
    status: 400,
    description: 'Type de ressource invalide'
  })
  async getResourcesByType(@Param('type') type: ResourceType) {
    return await this.resourceService.findByType(type);
  }

  /**
   * Obtenir une ressource par son ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir une ressource par son ID',
    description: 'Récupère une ressource spécifique par son identifiant'
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la ressource'
  })
  @ApiResponse({
    status: 200,
    description: 'Ressource trouvée'
  })
  @ApiResponse({
    status: 400,
    description: 'ID invalide'
  })
  @ApiResponse({
    status: 404,
    description: 'Ressource non trouvée'
  })
  async getResourceById(@Param('id') id: string) {
    return await this.resourceService.findById(id);
  }

  /**
   * Publier une ressource (Admin uniquement)
   */
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publier une ressource',
    description: 'Permet aux administrateurs de publier une ressource existante'
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la ressource à publier'
  })
  @ApiResponse({
    status: 200,
    description: 'Ressource publiée avec succès'
  })
  @ApiResponse({
    status: 404,
    description: 'Ressource non trouvée'
  })
  async publishResource(@Param('id') id: string) {
    return await this.resourceService.publishResource(id);
  }

  /**
   * Dépublier une ressource (Admin uniquement)
   */
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dépublier une ressource',
    description: 'Permet aux administrateurs de dépublier une ressource existante'
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la ressource à dépublier'
  })
  @ApiResponse({
    status: 200,
    description: 'Ressource dépubliée avec succès'
  })
  @ApiResponse({
    status: 404,
    description: 'Ressource non trouvée'
  })
  async unpublishResource(@Param('id') id: string) {
    return await this.resourceService.unpublishResource(id);
  }
}

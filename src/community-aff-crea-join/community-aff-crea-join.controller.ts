import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiConsumes,
  ApiQuery
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { CommunityAffCreaJoinService } from './community-aff-crea-join.service';
import { CreateCommunityDto } from '../dto-community/create-community.dto';
import { JoinCommunityDto, JoinByInviteDto, GenerateInviteDto } from '../dto-community/join-community.dto';
import { UpdateCommunityCustomizationDto } from '../dto-community/update-community-customization.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Query } from '@nestjs/common';
import { FileType, UploadService } from '../upload/upload.service';
import { MediaPurpose } from '../media/media.types';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';

@ApiTags('Community Management')
@Controller('community-aff-crea-join')
@UseInterceptors(HttpCacheInterceptor)
export class CommunityAffCreaJoinController {
  constructor(
    private readonly communityService: CommunityAffCreaJoinService,
    private readonly uploadService: UploadService,
    private readonly authService: AuthService,
  ) { }

  /**
   * Créer une nouvelle communauté
   * Route: POST /community-aff-crea-join/create
   * Authentification: JWT obligatoire
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/image');
      },
      filename: (req, file, cb) => {
        const extension = extname(file.originalname);
        const uniqueName = `${Date.now()}-${uuidv4()}${extension}`;
        cb(null, uniqueName);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Créer une nouvelle communauté',
    description: 'Permet à un utilisateur authentifié de créer une nouvelle communauté. L\'utilisateur devient automatiquement le créateur, membre et administrateur de la communauté.'
  })
  @ApiConsumes('multipart/form-data') // Ajout pour indiquer le support des fichiers
  @ApiBody({
    type: CreateCommunityDto,
    description: 'Données de la communauté à créer (avec possibilité d\'upload de logo)'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Communauté créée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Communauté créée avec succès',
        data: {
          _id: '507f1f77bcf86cd799439011',
          name: 'Développeurs JavaScript',
          logo: 'https://example.com/logo.png',
          photo_de_couverture: 'https://example.com/cover.jpg',
          short_description: 'Une communauté pour partager des connaissances sur JavaScript',
          createur: {
            _id: '507f1f77bcf86cd799439012',
            name: 'John Doe',
            email: 'john@example.com'
          },
          members: [
            {
              _id: '507f1f77bcf86cd799439012',
              name: 'John Doe',
              email: 'john@example.com'
            }
          ],
          admins: [
            {
              _id: '507f1f77bcf86cd799439012',
              name: 'John Doe',
              email: 'john@example.com'
            }
          ],
          rank: 'bronze',
          fees_of_join: 0,
          isPrivate: false,
          isActive: true,
          isVerified: false,
          membersCount: 1,
          createdAt: '2023-12-01T00:00:00.000Z',
          updatedAt: '2023-12-01T00:00:00.000Z'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Données invalides',
    schema: {
      example: {
        success: false,
        message: 'Données invalides',
        error: {
          statusCode: 400,
          message: ['Le nom doit contenir au moins 2 caractères', 'Le logo doit être une URL valide'],
          error: 'Bad Request'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token JWT manquant ou invalide',
    schema: {
      example: {
        success: false,
        message: 'Non autorisé',
        error: {
          statusCode: 401,
          message: 'Unauthorized'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Une communauté avec ce nom existe déjà',
    schema: {
      example: {
        success: false,
        message: 'Une communauté avec ce nom existe déjà',
        error: {
          statusCode: 409,
          message: 'Une communauté avec ce nom existe déjà',
          error: 'Conflict'
        }
      }
    }
  })
  async createCommunity(
    @Body() createCommunityDto: CreateCommunityDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    try {
      console.log('🔍 [CREATE COMMUNITY] Request received')
      console.log('🔍 [CREATE COMMUNITY] DTO:', JSON.stringify(createCommunityDto, null, 2))
      console.log('🔍 [CREATE COMMUNITY] User:', req.user?._id)
      console.log('🔍 [CREATE COMMUNITY] User role before:', req.user?.role)

      const userId = req.user._id;
      const uploadedFiles: { logo?: string } = {};

      if (file) {
        const result = await this.uploadService.processUploadedFile(
          file,
          file.filename,
          {
            userId,
            purpose: MediaPurpose.COMMUNITY_LOGO,
          }
        );
        uploadedFiles.logo = result.url;
        console.log('📸 Logo final enregistré:', uploadedFiles.logo);
      }

      const { community, user } = await this.communityService.createCommunity(
        createCommunityDto,
        uploadedFiles,
        userId
      );

      // Generate a new JWT token for the user with the potentially updated role
      const accessToken = this.authService.generateToken(user);

      console.log('✅ [CREATE COMMUNITY] Communauté créée avec succès:', {
        id: community._id,
        name: community.name,
        slug: community.slug,
        newRole: user.role
      });

      return {
        success: true,
        message: 'Communauté créée avec succès',
        data: community,
        communityId: community._id,
        accessToken, // Return new token so frontend role updates immediately
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      };
    } catch (error) {
      console.error('❌ [CREATE COMMUNITY] Error:', error);
      console.error('❌ [CREATE COMMUNITY] Error message:', error.message);
      console.error('❌ [CREATE COMMUNITY] Error stack:', error.stack);
      
      // Return proper error response for validation errors
      if (error.response && error.response.statusCode) {
        throw error;
      }
      
      // Handle other errors
      throw new InternalServerErrorException({
        success: false,
        message: error.message || 'Erreur lors de la création de la communauté',
        error: 'Internal Server Error'
      });
    }
  }


  /**
   * Obtenir toutes les communautés créées par l'utilisateur
   * Route: GET /community-aff-crea-join/my-created
   * Authentification: JWT obligatoire
   */
  @Get('my-created')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir mes communautés créées',
    description: 'Récupère toutes les communautés créées par l\'utilisateur authentifié'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des communautés créées',
    schema: {
      example: {
        success: true,
        message: 'Communautés récupérées avec succès',
        data: [
          {
            _id: '507f1f77bcf86cd799439011',
            name: 'Développeurs JavaScript',
            logo: 'https://example.com/logo.png',
            membersCount: 25,
            createdAt: '2023-12-01T00:00:00.000Z'
          }
        ]
      }
    }
  })
  async getMyCreatedCommunities(@Request() req: any) {
    try {
      const userId = req.user._id || req.user.userId;
      if (!userId) {
        throw new Error('User ID not found in request');
      }

      console.log('🔍 Getting created communities for user:', userId);
      const communities = await this.communityService.getUserCreatedCommunities(userId);

      return {
        success: true,
        message: 'Communautés récupérées avec succès',
        data: communities
      };
    } catch (error) {
      console.error('❌ Error in getMyCreatedCommunities:', error);
      throw error;
    }
  }

  
  @Get('my-joined')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir mes communautés rejointes',
    description: 'Récupère toutes les communautés dont l\'utilisateur authentifié est membre'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des communautés rejointes'
  })
  async getMyJoinedCommunities(@Request() req: any) {
    try {
      const userId = req.user._id;
      const communities = await this.communityService.getUserJoinedCommunities(userId);

      return {
        success: true,
        message: 'Communautés rejointes récupérées avec succès',
        data: communities
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtenir toutes les communautés publiques
   * Route: GET /community-aff-crea-join/public/all
   * Authentification: JWT obligatoire
   */
  @Get('public/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir toutes les communautés publiques',
    description: 'Récupère toutes les communautés publiques et actives'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des communautés publiques'
  })
  async getPublicCommunities() {
    try {
      const communities = await this.communityService.getPublicCommunities();

      return {
        success: true,
        message: 'Communautés publiques récupérées avec succès',
        data: communities
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtenir les communautés gérables par l'utilisateur (propriétaire ou admin)
   * Route: GET /community-aff-crea-join/my-manageable
   * Authentification: JWT obligatoire
   */
  @Get('my-manageable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir mes communautés gérables',
    description: 'Récupère toutes les communautés dont l\'utilisateur est propriétaire ou administrateur'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des communautés gérables'
  })
  async getMyManageableCommunities(@Request() req: any) {
    try {
      const userId = req.user._id;
      const communities = await this.communityService.getUserManageableCommunities(userId);

      return {
        success: true,
        message: 'Communautés gérables récupérées avec succès',
        data: communities
      };
    } catch (error) {
      throw error;
    }
  }

  /**
    * Obtenir toutes les communautés
    * Route: GET /community-aff-crea-join/all-communities
    * Authentification: Optionnelle (public)
    */
  @Get('all-communities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir toutes les communautés',
    description: 'Récupère toutes les communautés actives avec leurs informations complètes'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des communautés récupérée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Communautés récupérées avec succès',
        data: [
          {
            _id: '507f1f77bcf86cd799439011',
            name: 'Développeurs JavaScript',
            logo: 'https://example.com/logo.png',
            photo_de_couverture: 'https://example.com/cover.jpg',
            short_description: 'Une communauté pour partager des connaissances sur JavaScript',
            createur: {
              _id: '507f1f77bcf86cd799439012',
              name: 'John Doe',
              email: 'john@example.com'
            },
            members: [
              {
                _id: '507f1f77bcf86cd799439012',
                name: 'John Doe',
                email: 'john@example.com'
              }
            ],
            admins: [
              {
                _id: '507f1f77bcf86cd799439012',
                name: 'John Doe',
                email: 'john@example.com'
              }
            ],
            rank: 1,
            fees_of_join: 0,
            isPrivate: false,
            isActive: true,
            isVerified: false,
            membersCount: 1,
            createdAt: '2023-12-01T00:00:00.000Z',
            updatedAt: '2023-12-01T00:00:00.000Z'
          }
        ]
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Erreur interne du serveur'
  })
  async getAllCommunities(@Request() req?: any) {
    try {
      const communities = await this.communityService.getAllCommunities();

      return {
        success: true,
        message: 'Communautés récupérées avec succès',
        data: communities
      };
    } catch (error) {
      console.error('❌ Erreur dans getAllCommunities:', error);
      throw error;
    }
  }

  /**
   * Obtenir le classement des communautés par nombre de membres
   * Route: GET /community-aff-crea-join/ranking
   * Authentification: JWT obligatoire
   */
  @Get('ranking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir le classement des communautés',
    description: 'Récupère le classement des communautés basé sur le nombre de membres (rang 1 = plus de membres)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Classement des communautés',
    schema: {
      example: {
        success: true,
        message: 'Classement récupéré avec succès',
        data: [
          {
            _id: '507f1f77bcf86cd799439011',
            name: 'Développeurs JavaScript',
            logo: 'https://example.com/logo.png',
            membersCount: 150,
            rank: 1,
            createur: {
              _id: '507f1f77bcf86cd799439012',
              name: 'John Doe',
              email: 'john@example.com'
            },
            createdAt: '2023-12-01T00:00:00.000Z'
          },
          {
            _id: '507f1f77bcf86cd799439013',
            name: 'Python Developers',
            logo: 'https://example.com/logo2.png',
            membersCount: 120,
            rank: 2,
            createur: {
              _id: '507f1f77bcf86cd799439014',
              name: 'Jane Smith',
              email: 'jane@example.com'
            },
            createdAt: '2023-11-15T00:00:00.000Z'
          }
        ]
      }
    }
  })
  async getCommunityRanking() {
    try {
      const communities = await this.communityService.getCommunityRanking();

      return {
        success: true,
        message: 'Classement récupéré avec succès',
        data: communities
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Forcer la mise à jour des rangs (utile pour les tests)
   * Route: POST /community-aff-crea-join/update-ranks
   * Authentification: JWT obligatoire
   */
  @Post('update-ranks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mettre à jour les rangs des communautés',
    description: 'Force la mise à jour des rangs de toutes les communautés basé sur le nombre de membres'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rangs mis à jour avec succès'
  })
  async updateCommunityRanks() {
    try {
      await this.communityService.updateCommunityRanks();

      return {
        success: true,
        message: 'Rangs mis à jour avec succès'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Rejoindre une communauté directement par ID
   * Route: POST /community-aff-crea-join/join
   * Authentification: JWT obligatoire
   */
  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Rejoindre une communauté',
    description: 'Permet à un utilisateur de rejoindre une communauté publique en utilisant son ID'
  })
  @ApiBody({
    type: JoinCommunityDto,
    description: 'Données pour rejoindre la communauté'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communauté rejointe avec succès',
    schema: {
      example: {
        success: true,
        message: 'Vous avez rejoint la communauté avec succès',
        data: {
          _id: '507f1f77bcf86cd799439011',
          name: 'Développeurs JavaScript',
          membersCount: 26,
          members: [
            {
              _id: '507f1f77bcf86cd799439012',
              name: 'John Doe',
              email: 'john@example.com'
            }
          ]
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Données invalides'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Vous êtes déjà membre de cette communauté'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Communauté privée ou inactive'
  })
  async joinCommunity(
    @Body() joinCommunityDto: JoinCommunityDto,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id;
      const community = await this.communityService.joinCommunity(joinCommunityDto, userId);

      return {
        success: true,
        message: 'Vous avez rejoint la communauté avec succès',
        data: community
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Rejoindre une communauté via un lien d'invitation
   * Route: POST /community-aff-crea-join/join-by-invite
   * Authentification: JWT obligatoire
   */
  @Post('join-by-invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Rejoindre une communauté via invitation',
    description: 'Permet à un utilisateur de rejoindre une communauté (publique ou privée) en utilisant un code d\'invitation'
  })
  @ApiBody({
    type: JoinByInviteDto,
    description: 'Données pour rejoindre par invitation'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communauté rejointe avec succès via invitation'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Données invalides'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Code d\'invitation invalide ou expiré'
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Vous êtes déjà membre de cette communauté'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Communauté inactive'
  })
  async joinByInvite(
    @Body() joinByInviteDto: JoinByInviteDto,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id;
      const community = await this.communityService.joinByInvite(joinByInviteDto, userId);

      return {
        success: true,
        message: 'Vous avez rejoint la communauté avec succès via invitation',
        data: community
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Générer un lien d'invitation pour une communauté
   * Route: POST /community-aff-crea-join/generate-invite
   * Authentification: JWT obligatoire
   */
  @Post('generate-invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Générer un lien d\'invitation',
    description: 'Permet aux créateurs et administrateurs de générer un lien d\'invitation pour leur communauté'
  })
  @ApiBody({
    type: GenerateInviteDto,
    description: 'Données pour générer le lien'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lien d\'invitation généré avec succès',
    schema: {
      example: {
        success: true,
        message: 'Lien d\'invitation généré avec succès',
        data: {
          inviteCode: 'abc123DEF456',
          inviteLink: 'https://chabaqa.com/invite/abc123DEF456'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Données invalides'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Seuls les créateurs et administrateurs peuvent générer des liens'
  })
  async generateInviteLink(
    @Body() generateInviteDto: GenerateInviteDto,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id;
      const inviteData = await this.communityService.generateInviteLink(generateInviteDto, userId);

      return {
        success: true,
        message: 'Lien d\'invitation généré avec succès',
        data: inviteData
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate invitation code and get preview
   * Route: GET /community-aff-crea-join/validate-invite/:inviteCode
   */
  @Get('validate-invite/:inviteCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Validate invitation code and get community preview',
    description: 'Validates an invitation code and returns a preview of the private community (name, description, price, etc.) without revealing sensitive content.'
  })
  @ApiParam({
    name: 'inviteCode',
    description: 'The unique invitation code to validate',
    example: 'abc123DEF456'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Invitation code is valid',
    schema: {
      example: {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439011',
          name: 'Private Alpha Group',
          description: 'Exclusive group for early adopters',
          logo: 'https://example.com/logo.png',
          membersCount: 42,
          price: 99,
          currency: 'USD',
          isPrivate: true,
          priceType: 'one-time'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Invitation code is invalid or expired' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Community is inactive' 
  })
  async validateInvite(@Param('inviteCode') inviteCode: string) {
    const preview = await this.communityService.validateInviteCode(inviteCode);
    return {
      success: true,
      data: preview
    };
  }

  /**
   * Quitter une communauté
   * Route: POST /community-aff-crea-join/leave/:communityId
   * Authentification: JWT obligatoire
   */
  @Post('leave/:communityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quitter une communauté',
    description: 'Permet à un utilisateur de quitter une communauté dont il est membre'
  })
  @ApiParam({
    name: 'communityId',
    description: 'ID de la communauté à quitter',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communauté quittée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Vous avez quitté la communauté avec succès'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Vous n\'êtes pas membre de cette communauté'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Le créateur ne peut pas quitter sa propre communauté'
  })
  async leaveCommunity(
    @Param('communityId') communityId: string,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id;
      const result = await this.communityService.leaveCommunity(communityId, userId);

      return {
        success: true,
        message: result.message
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Accéder à une invitation via lien direct (GET)
   * Route: GET /community-aff-crea-join/join-by-invite/:inviteCode
   * Authentification: JWT obligatoire
   */
  @Get('join-by-invite/:inviteCode')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({
    summary: 'Compatibilité anciens liens d\'invitation',
    description: 'Redirige les anciens liens backend vers la route frontend /invite/:inviteCode'
  })
  @ApiParam({
    name: 'inviteCode',
    description: 'Code d\'invitation unique',
    example: 'abc123DEF456'
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirection vers la page d\'invitation frontend'
  })
  async joinByInviteLink(
    @Param('inviteCode') inviteCode: string,
    @Res() res: Response,
  ) {
    const frontendBase = (process.env.FRONTEND_URL || 'https://chabaqa.com').replace(/\/+$/, '');
    const destination = `${frontendBase}/invite/${encodeURIComponent(inviteCode)}`;
    return res.redirect(HttpStatus.FOUND, destination);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir les membres d\'une communauté',
    description: 'Retourne les membres d\'une communauté avec leur rôle (admin/moderator/member) et pagination.'
  })
  @ApiParam({
    name: 'id',
    description: 'ID MongoDB ou slug de la communauté',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCommunityMembers(
    @Param('id') id: string,
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<PaginatedResponseDto<any>> {
    const userId = req.user._id || req.user.userId;
    return this.communityService.getCommunityMembers(id, userId, Number(page), Number(limit));
  }

  /**
   * Update community customization/settings
   * Route: PATCH /community-aff-crea-join/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({
    summary: 'Mettre à jour une communauté',
    description: 'Met à jour les options de personnalisation de la communauté (contenu, design, layout, paramètres avancés).'
  })
  @ApiBody({
    type: UpdateCommunityCustomizationDto,
    description: 'Payload de personnalisation de communauté',
  })
  async updateCommunity(
    @Param('id') communityIdOrSlug: string,
    @Body() updateData: UpdateCommunityCustomizationDto,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, updateData, req);
  }

  /**
   * Backward-compatible aliases for update customization route
   * Some frontend deployments may call PUT and/or /update/:id variants.
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateCommunityPut(
    @Param('id') communityIdOrSlug: string,
    @Body() updateData: UpdateCommunityCustomizationDto,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, updateData, req);
  }

  @Patch('update/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateCommunityLegacyPatch(
    @Param('id') communityIdOrSlug: string,
    @Body() updateData: UpdateCommunityCustomizationDto,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, updateData, req);
  }

  @Put('update/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateCommunityLegacyPut(
    @Param('id') communityIdOrSlug: string,
    @Body() updateData: UpdateCommunityCustomizationDto,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, updateData, req);
  }

  /**
   * Settings-only update route (main)
   * Route: PATCH /community-aff-crea-join/:id/settings
   */
  @Patch(':id/settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateCommunitySettings(
    @Param('id') communityIdOrSlug: string,
    @Body() settings: Record<string, any>,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, { settings } as any, req);
  }

  /**
   * Settings-only update route (compat alias)
   * Route: PUT /community-aff-crea-join/:id/settings
   */
  @Put(':id/settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateCommunitySettingsPut(
    @Param('id') communityIdOrSlug: string,
    @Body() settings: Record<string, any>,
    @Request() req: any
  ) {
    return this.performCommunityUpdate(communityIdOrSlug, { settings } as any, req);
  }

  /**
   * Diagnostics endpoint to verify route availability on deployed environment.
   */
  @Get('health/routes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async getCustomizationRoutesHealth() {
    return {
      success: true,
      data: {
        patchMain: true,
        putMain: true,
        patchLegacy: true,
        putLegacy: true,
        patchSettings: true,
        putSettings: true,
      },
    };
  }

  private async performCommunityUpdate(
    communityIdOrSlug: string,
    updateData: UpdateCommunityCustomizationDto,
    req: any,
  ) {
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    const community = await this.communityService.updateCommunity(
      communityIdOrSlug,
      userId,
      updateData || {},
    );

    return {
      success: true,
      message: 'Communauté mise à jour avec succès',
      data: community,
    };
  }

  /**
   * Obtenir une communauté par son ID ou slug
   * Route: GET /community-aff-crea-join/:id
   * Authentification: Optionnelle (public)
   * 
   * IMPORTANT: Cette route doit être placée EN DERNIER car elle utilise un paramètre dynamique (:id)
   * qui pourrait capturer d'autres routes spécifiques si elle était placée avant.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir une communauté par ID ou slug',
    description: 'Récupère les détails d\'une communauté spécifique via son ID MongoDB ou son slug'
  })
  @ApiParam({
    name: 'id',
    description: 'ID MongoDB ou slug de la communauté',
    examples: {
      id: {
        value: '507f1f77bcf86cd799439011',
        description: 'MongoDB ObjectId'
      },
      slug: {
        value: 'javascript-developers-tunisia',
        description: 'Community slug'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Détails de la communauté'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  async getCommunityById(@Param('id') communityId: string, @Request() req: any) {
    try {
      const viewerId = req?.user?._id || req?.user?.userId;
      const community = await this.communityService.getCommunityForViewer(
        communityId,
        viewerId ? String(viewerId) : undefined,
      );

      return {
        success: true,
        message: 'Communauté récupérée avec succès',
        data: community
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Acheter une adhésion à une communauté (paid community)
   * Route: POST /community-aff-crea-join/:id/checkout
   */
  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acheter l\'adhésion à une communauté (paid community)' })
  @ApiQuery({ name: 'promoCode', required: false, type: String })
  async checkoutCommunity(
    @Param('id') communityId: string,
    @Query('promoCode') promoCode: string | undefined,
    @Request() req: any
  ) {
    const result = await this.communityService.checkoutCommunityMembership(communityId, req.user._id, promoCode);
    return { success: true, ...result };
  }

  /**
   * Checkout for private community via invite
   * Route: POST /community-aff-crea-join/checkout-private/:inviteCode
   */
  @Post('checkout-private/:inviteCode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Checkout for private community using invite code',
    description: 'Allows a user to join/pay for a private community using a valid invitation code, bypassing standard private community restrictions.'
  })
  @ApiParam({
    name: 'inviteCode',
    description: 'The valid invitation code for the private community',
    example: 'abc123DEF456'
  })
  @ApiQuery({ 
    name: 'promoCode', 
    required: false, 
    type: String,
    description: 'Optional promotional code for discounts'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Successfully joined or payment initiated',
    schema: {
      example: {
        success: true,
        message: 'Adhésion achetée avec succès'
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Invitation code invalid' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Community inactive or user already a member' 
  })
  async checkoutPrivateCommunity(
    @Param('inviteCode') inviteCode: string,
    @Query('promoCode') promoCode: string | undefined,
    @Request() req: any
  ) {
    const result = await this.communityService.checkoutPrivateCommunity(inviteCode, req.user._id, promoCode);
    return { success: true, ...result };
  }

  /**
   * Ajouter un administrateur à une communauté
   * Route: POST /community-aff-crea-join/:id/admins/:userId
   */
  @Post(':id/admins/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter un administrateur à une communauté' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Administrateur ajouté' })
  async addAdmin(@Param('id') communityId: string, @Param('userId') userId: string, @Request() req: any) {
    const result = await this.communityService.addAdmin(communityId, userId, req.user._id);
    return { success: true, ...result };
  }

  /**
   * Retirer un administrateur d'une communauté
   * Route: POST /community-aff-crea-join/:id/admins/:userId/remove
   */
  @Post(':id/admins/:userId/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un administrateur d\'une communauté' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Administrateur retiré' })
  async removeAdmin(@Param('id') communityId: string, @Param('userId') userId: string, @Request() req: any) {
    const result = await this.communityService.removeAdmin(communityId, userId, req.user._id);
    return { success: true, ...result };
  }

  /**
   * Get active/online members of a community
   * Route: GET /community-aff-crea-join/:slug/active-members
   * Returns members with their online status
   */
  @Get(':slug/active-members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer les membres actifs d\'une communauté' })
  @ApiParam({ name: 'slug', description: 'Slug de la communauté' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre maximum de membres à retourner (défaut: 20)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Membres actifs récupérés avec succès',
    schema: {
      example: {
        success: true,
        message: 'Active members retrieved successfully',
        data: {
          members: [
            {
              id: '507f1f77bcf86cd799439011',
              name: 'John Doe',
              email: 'john@example.com',
              avatar: 'https://example.com/avatar.jpg',
              bio: 'Developer and tech enthusiast',
              isOnline: true,
              lastActive: '2024-01-15T10:30:00Z'
            }
          ],
          total: 15,
          online: 8
        }
      }
    }
  })
  async getActiveMembers(
    @Param('slug') slug: string,
    @Query('limit') limit?: number
  ) {
    const result = await this.communityService.getActiveMembers(slug, limit || 20);
    return {
      success: true,
      message: 'Active members retrieved successfully',
      data: result
    };
  }

  /**
   * Get community statistics
   * Route: GET /community-aff-crea-join/:id/stats
   * Authentification: JWT obligatoire
   */
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtenir les statistiques d\'une communauté',
    description: 'Récupère les statistiques d\'une communauté (membres, engagement, croissance)'
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la communauté',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistiques récupérées avec succès',
    schema: {
      example: {
        success: true,
        message: 'Statistiques récupérées avec succès',
        data: {
          membersCount: 1250,
          engagementRate: 85,
          monthlyGrowth: 12,
          isPublic: true
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  async getCommunityStats(@Param('id') communityId: string) {
    try {
      const stats = await this.communityService.getCommunityStats(communityId);

      return {
        success: true,
        message: 'Statistiques récupérées avec succès',
        data: stats
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a community (only creator can delete)
   * Route: DELETE /community-aff-crea-join/:id
   * Authentification: JWT obligatoire
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une communauté',
    description: 'Permet au créateur de supprimer définitivement sa communauté'
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la communauté à supprimer',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Communauté supprimée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Communauté supprimée avec succès'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Communauté non trouvée'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Seul le créateur peut supprimer la communauté'
  })
  async deleteCommunity(
    @Param('id') communityId: string,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id;
      console.log('🗑️ [DELETE COMMUNITY] Request to delete community:', communityId, 'by user:', userId);

      // Get the community to check ownership
      const community = await this.communityService.getCommunityById(communityId);
      
      if (!community) {
        throw new NotFoundException('Communauté non trouvée');
      }

      // Check if user is the creator
      const creatorId = community.createur?._id?.toString() || community.createur?.toString();
      const requestUserId = userId.toString();

      if (creatorId !== requestUserId) {
        throw new ForbiddenException('Seul le créateur peut supprimer cette communauté');
      }

      // Delete the community
      await this.communityService.deleteCommunity(communityId);

      console.log('✅ [DELETE COMMUNITY] Community deleted successfully:', communityId);

      return {
        success: true,
        message: 'Communauté supprimée avec succès'
      };
    } catch (error) {
      console.error('❌ [DELETE COMMUNITY] Error:', error);
      throw error;
    }
  }

  /**
   * Get community reviews
   * Route: GET /community-aff-crea-join/:id/reviews
   */
  @Get(':id/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all reviews for a community' })
  @ApiParam({ name: 'id', description: 'Community ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reviews retrieved successfully' })
  async getCommunityReviews(@Param('id') communityId: string) {
    try {
      const result = await this.communityService.getCommunityReviews(communityId);
      return {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('❌ [GET REVIEWS] Error:', error);
      throw error;
    }
  }

  /**
   * Get current user's review for a community
   * Route: GET /community-aff-crea-join/:id/reviews/me
   */
  @Get(':id/reviews/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user\'s review for a community' })
  @ApiParam({ name: 'id', description: 'Community ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User review retrieved successfully' })
  async getMyReview(
    @Param('id') communityId: string,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id || req.user.userId;
      const review = await this.communityService.getUserCommunityReview(communityId, userId);
      return {
        success: true,
        review
      };
    } catch (error) {
      console.error('❌ [GET MY REVIEW] Error:', error);
      throw error;
    }
  }

  /**
   * Submit or update a review for a community
   * Route: POST /community-aff-crea-join/:id/reviews
   */
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit or update a review for a community' })
  @ApiParam({ name: 'id', description: 'Community ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        rating: { type: 'number', minimum: 1, maximum: 5 },
        comment: { type: 'string', maxLength: 1000 }
      },
      required: ['rating']
    }
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Review submitted successfully' })
  async submitReview(
    @Param('id') communityId: string,
    @Body('rating') rating: number,
    @Body('comment') comment: string,
    @Request() req: any
  ) {
    try {
      const userId = req.user._id || req.user.userId;
      const result = await this.communityService.submitCommunityReview(communityId, userId, rating, comment);
      return {
        success: true,
        message: 'Review submitted successfully',
        ...result
      };
    } catch (error) {
      console.error('❌ [SUBMIT REVIEW] Error:', error);
      throw error;
    }
  }
}

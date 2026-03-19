import { Controller, Get, Post, Param, Body, Query, UseGuards, Req, Patch, Delete, Put, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery, ApiParam, ApiBody, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CoursContentService } from './services/cours-content.service';
import { CoursEnrollmentService } from './services/cours-enrollment.service';
import { CoursTrackingService } from './services/cours-tracking.service';
import { CoursProgressionService } from './services/cours-progression.service';
import { CoursNotesService } from './services/cours-notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { CreateCoursDto } from '../dto-cours/create-cours.dto';
import { CreateUserNoteDto, UpdateUserNoteDto, UserNoteResponseDto } from '../dto-cours/user-note.dto';
import { AddSectionDto } from '../dto-cours/add-section.dto';
import { AddChapitreToSectionDto } from '../dto-cours/add-chapitre-to-section.dto';
import { UpdateSequentialProgressionDto, ChapterAccessResponseDto, UnlockedChaptersResponseDto } from '../dto-cours/sequential-progression.dto';
import { CourseSessionDto } from '../common/dto/course-session.dto';
import { UpdateCoursDto, UpdateSectionDto, UpdateChapitreDto } from '../dto-cours/update-cours.dto';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CacheTTL, CacheDuration } from '../common/decorators/cache-ttl.decorator';
import { UpdateIncrementalWatchTimeDto } from '../common/dto/update-watch-time.dto';

interface AuthenticatedUser {
	_id: string;
	role: string;
}

const resolveRequestIpAddress = (req: any): string | undefined => {
	const forwarded = req?.headers?.['x-forwarded-for'];
	const realIp = req?.headers?.['x-real-ip'];

	let candidate: unknown = null;
	if (Array.isArray(forwarded)) candidate = forwarded[0];
	else if (typeof forwarded === 'string') candidate = forwarded.split(',')[0];
	else if (Array.isArray(realIp)) candidate = realIp[0];
	else if (typeof realIp === 'string') candidate = realIp;
	else candidate = req?.ip || req?.socket?.remoteAddress;

	if (typeof candidate !== 'string') return undefined;
	const trimmed = candidate.trim();
	if (!trimmed) return undefined;
	return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
};

const enrichTrackingMetadata = (req: any, metadata?: any) => {
	const enriched = { ...(metadata || {}) };
	const userAgent = req?.headers?.['user-agent'];
	if (typeof userAgent === 'string' && !enriched.userAgent) enriched.userAgent = userAgent;
	const ipAddress = resolveRequestIpAddress(req);
	if (ipAddress && !enriched.ipAddress) enriched.ipAddress = ipAddress;
	return enriched;
};

@ApiTags('Cours')
@Controller('cours')
@UseInterceptors(HttpCacheInterceptor)
export class CoursController {
		constructor(
		private readonly coursContentService: CoursContentService,
		private readonly coursEnrollmentService: CoursEnrollmentService,
		private readonly coursTrackingService: CoursTrackingService,
		private readonly coursProgressionService: CoursProgressionService,
			private readonly coursNotesService: CoursNotesService,
		) { }

		private getRequestUserId(req: any): string {
			return (
				req?.user?._id ||
				req?.user?.userId ||
				req?.user?.sub ||
				req?.user?.id ||
				''
			).toString();
		}

	// ============ LISTE DES COURS ============

	@Get()
	@ApiOperation({
		summary: 'Récupérer la liste des cours',
		description: 'Récupère tous les cours avec pagination et filtres'
	})
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
	@ApiQuery({ name: 'category', required: false, type: String, description: 'Filtrer par catégorie' })
	@ApiQuery({ name: 'niveau', required: false, type: String, description: 'Filtrer par niveau' })
	@ApiQuery({ name: 'search', required: false, type: String, description: 'Rechercher dans le titre et la description' })
	@ApiResponse({
		status: 200,
		description: 'Liste des cours récupérée avec succès',
		schema: {
			example: {
				success: true,
				message: 'Cours récupérés avec succès',
				data: {
					courses: [
						{
							id: '1',
							titre: 'Introduction à React',
							description: 'Apprenez les bases de React',
							prix: 49.99,
							devise: 'TND',
							category: 'Programmation',
							niveau: 'débutant',
							duree: '20h',
							creator: {
								name: 'John Doe',
								avatar: 'https://example.com/avatar.jpg'
							},
							createdAt: '2024-01-15T10:30:00Z'
						}
					],
					pagination: {
						page: 1,
						limit: 10,
						total: 25,
						pages: 3
					}
				}
			}
		}
	})
	async getCourses(
		@Query('page') page: number = 1,
		@Query('limit') limit: number = 10,
		@Query('category') category?: string,
		@Query('niveau') niveau?: string,
		@Query('search') search?: string
	) {
		return this.coursContentService.getCourses(page, limit, category, niveau, search);
	}

	// ============ CRÉATION DE COURS ============

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@ApiBearerAuth('JWT-auth')
	@Post('create-cours')
	@ApiOperation({
		summary: 'Créer un cours complet',
		description: 'Créer un nouveau cours avec sections et chapitres optionnels. Seuls les créateurs peuvent créer des cours.'
	})
	@ApiBody({
		type: CreateCoursDto,
		description: 'Données du cours à créer',
		examples: {
			'Cours Simple': {
				summary: 'Création d\'un cours basique',
				value: {
					titre: 'Introduction à React',
					description: 'Apprenez les bases de React',
					prix: 49.99,
					isPaid: true,
					devise: 'TND',
					communitySlug: 'web-dev-community',
					isPublished: false
				}
			},
			'Cours Complet': {
				summary: 'Création d\'un cours avec sections et chapitres',
				value: {
					titre: 'Développement Web Full-Stack',
					description: 'Cours complet pour devenir développeur full-stack',
					prix: 199.99,
					isPaid: true,
					devise: 'TND',
					communitySlug: 'web-dev-community',
					isPublished: false,
					category: 'Programmation',
					niveau: 'intermédiaire',
					duree: '40h',
					learningObjectives: ['Maîtriser React', 'Créer des APIs Node.js'],
					prerequisites: ['Connaissances HTML/CSS', 'Bases JavaScript'],
					sections: [
						{
							titre: 'Frontend avec React',
							description: 'Apprentissage de React',
							ordre: 1,
							chapitres: [
								{
									titre: 'Introduction à React',
									description: 'Les concepts de base',
									ordre: 1,
									contenu: 'Contenu du chapitre...',
									ressources: [
										{
											titre: 'Vidéo d\'introduction',
											type: 'video',
											url: 'https://example.com/video1.mp4',
											description: 'Vidéo explicative'
										}
									]
								}
							]
						}
					]
				}
			}
		}
	})
	@ApiResponse({
		status: 201,
		description: 'Cours créé avec succès',
		content: {
			'application/json': {
				example: {
					message: 'Cours créé avec succès',
					cours: {
						_id: '64a1b2c3d4e5f6789abcdef0',
						titre: 'Introduction à React',
						description: 'Apprenez les bases de React',
						prix: 49.99,
						isPaid: true,
						devise: 'TND',
						communitySlug: 'web-dev-community',
						creatorId: '64a1b2c3d4e5f6789abcdef1',
						isPublished: false,
						createdAt: '2024-01-15T10:00:00.000Z'
					}
				}
			}
		}
	})
	@ApiResponse({
		status: 400,
		description: 'Données invalides ou erreur de validation',
		content: {
			'application/json': {
				example: {
					statusCode: 400,
					message: ['Le titre est requis', 'Le prix doit être un nombre positif'],
					error: 'Bad Request'
				}
			}
		}
	})
	@ApiResponse({
		status: 401,
		description: 'Non autorisé - Token JWT manquant ou invalide',
		content: {
			'application/json': {
				example: {
					statusCode: 401,
					message: 'Unauthorized',
					error: 'Unauthorized'
				}
			}
		}
	})
	@ApiResponse({
		status: 404,
		description: 'Communauté non trouvée',
		content: {
			'application/json': {
				example: {
					statusCode: 404,
					message: 'Communauté non trouvée',
					error: 'Not Found'
				}
			}
		}
	})
	async createCours(@Body() dto: CreateCoursDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		const result = await this.coursContentService.creerCours(dto, user._id);
		return { message: 'Cours créé avec succès', cours: result };
	}

	// Alias de compatibilité: POST /cours/create
	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@ApiBearerAuth('JWT-auth')
	@Post('create')
	@ApiOperation({ summary: 'Créer un cours (alias /create-cours)' })
	async createCoursAlias(@Body() dto: CreateCoursDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		const result = await this.coursContentService.creerCours(dto, user._id);
		return { message: 'Cours créé avec succès', cours: result };
	}

	// Alias de compatibilité: POST /cours
	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@ApiBearerAuth('JWT-auth')
	@Post()
	@ApiOperation({ summary: 'Créer un cours (alias racine)' })
	async createCoursRoot(@Body() dto: CreateCoursDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		const result = await this.coursContentService.creerCours(dto, user._id);
		return { message: 'Cours créé avec succès', cours: result };
	}

	// ============ RÉCUPÉRATION DE COURS ============

	// Liste par communauté (placer avant :id pour éviter conflits)
	@Get('community/:slug')
	@ApiOperation({ summary: 'Lister les cours par communauté' })
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
	@ApiQuery({ name: 'published', required: false, type: Boolean, description: 'Filtrer par statut de publication' })
	async getCoursByCommunity(
		@Param('slug') slug: string,
		@Query('page') page = '1',
		@Query('limit') limit = '10',
		@Query('published') published = 'true',
		@Req() req,
	) {
		const userId = req.user?._id;
		const result = await this.coursContentService.obtenirCoursParCommunaute(
			slug,
			Number(page) || 1,
			Number(limit) || 10,
			published !== 'false',
			userId,
		);

		// Wrap response in the format expected by mobile
		return {
			success: true,
			message: 'Courses retrieved successfully',
			data: {
				courses: result.cours,
				pagination: {
					page: result.page,
					limit: result.limit,
					total: result.total,
					totalPages: result.totalPages
				}
			}
		};
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get('user/mes-cours')
	@ApiOperation({ summary: 'Lister les cours auxquels je suis inscrit' })
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
	async getMesCours(
		@Query('page') page = '1',
		@Query('limit') limit = '10',
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursEnrollmentService.obtenirCoursInscrit(user._id, Number(page) || 1, Number(limit) || 10);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get('user/created')
	@ApiOperation({ summary: 'Lister les cours créés par l\'utilisateur' })
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
	@ApiQuery({ name: 'communityId', required: false, type: String, description: 'Filtrer par communauté' })
	async getCoursCreated(
		@Req() req,
		@Query('page') page = '1',
		@Query('limit') limit = '10',
		@Query('communityId') communityId?: string,
	) {
		const user = req.user as AuthenticatedUser;
		const result = await this.coursContentService.obtenirCoursParCreateur(
			user._id,
			Number(page) || 1,
			Number(limit) || 10,
			communityId,
		);

		return {
			success: true,
			message: 'Courses retrieved successfully',
			data: {
				courses: result.cours,
				pagination: {
					page: result.page,
					limit: result.limit,
					total: result.total,
					totalPages: result.totalPages
				}
			}
		};
	}

	// Get courses for a specific user (for profile viewing)
	@Get('by-user/:userId')
	@UseGuards(OptionalJwtAuthGuard)
	@ApiOperation({
		summary: 'Get courses for a specific user',
		description: 'Retrieve courses associated with a user (enrolled + created)'
	})
	@ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
	@ApiQuery({ name: 'type', required: false, enum: ['enrolled', 'created', 'all'], description: 'Course type filter' })
	@ApiResponse({
		status: 200,
		description: 'User courses retrieved successfully',
		content: {
			'application/json': {
				example: {
					success: true,
					message: 'User courses retrieved successfully',
					data: {
						courses: [
							{
								id: '1',
								titre: 'React Fundamentals',
								description: 'Learn React basics',
								thumbnail: 'https://example.com/thumb.jpg',
								progress: 75,
								status: 'in_progress',
								type: 'enrolled'
							}
						],
						pagination: {
							page: 1,
							limit: 10,
							total: 5,
							totalPages: 1
						}
					}
				}
			}
		}
	})
	async getCoursesByUser(
		@Param('userId') userId: string,
		@Query('page') page = '1',
		@Query('limit') limit = '10',
		@Query('type') type: 'enrolled' | 'created' | 'all' = 'all',
		@Req() req: any,
	) {
		const requesterId = this.getRequestUserId(req);
		const visibilityScope = requesterId && requesterId === userId ? 'owner' : 'public';
		return await this.coursContentService.obtenirCoursParUtilisateur(
			userId,
			Number(page) || 1,
			Number(limit) || 10,
			type,
			visibilityScope,
		);
	}

	// Obtenir un cours par ID
	@Get(':id')
	@ApiOperation({ summary: 'Obtenir un cours par ID' })
	async getCoursById(@Param('id') id: string, @Req() req) {
		console.log('🔍 [CONTROLLER] getCoursById called with ID:', id);
		const userId = req.user?._id;
		console.log('🔍 [CONTROLLER] User ID:', userId);
		try {
			const result = await this.coursContentService.obtenirCours(id, userId);
			console.log('✅ [CONTROLLER] Course found:', result.titre);
			return result;
		} catch (error) {
			console.error('❌ [CONTROLLER] Error getting course:', error.message);
			throw error;
		}
	}

	// ============ GESTION DE COURS ============

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'id' })
	@ApiBearerAuth('JWT-auth')
	@Patch(':id')
	@ApiOperation({ summary: 'Mettre à jour un cours' })
	async updateCours(@Param('id') id: string, @Body() dto: UpdateCoursDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.updateCours(id, dto, user._id);
	}

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'id' })
	@ApiBearerAuth('JWT-auth')
	@Patch(':id/toggle-publication')
	@ApiOperation({ summary: 'Publier/Dépublier un cours' })
	async togglePublication(@Param('id') id: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.togglePublication(id, user._id);
	}

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'id' })
	@ApiBearerAuth('JWT-auth')
	@Delete(':id')
	@ApiOperation({ summary: 'Supprimer un cours' })
	async deleteCours(@Param('id') id: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.supprimerCours(id, user._id);
	}

	// ============ GESTION DES SECTIONS ============

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'coursId' })
	@ApiBearerAuth('JWT-auth')
	@Patch(':coursId/sections/:sectionId')
	@ApiOperation({ summary: 'Mettre à jour une section' })
	async updateSection(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Body() dto: UpdateSectionDto,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.updateSection(coursId, sectionId, dto, user._id);
	}

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'id' })
	@ApiBearerAuth('JWT-auth')
	@Post(':id/add-section')
	@ApiOperation({ summary: 'Ajouter une section à un cours' })
	async addSection(
		@Param('id') id: string,
		@Body() dto: AddSectionDto,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.ajouterSection(id, dto, user._id);
	}

	@UseGuards(JwtAuthGuard, CommunityPermissionGuard)
	@RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
	@CommunityIdFrom({ type: 'entity', modelName: 'Cours', paramName: 'coursId' })
	@ApiBearerAuth('JWT-auth')
	@Delete(':coursId/sections/:sectionId')
	@ApiOperation({ summary: 'Supprimer une section d\'un cours' })
	async deleteSection(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.supprimerSection(coursId, sectionId, user._id);
	}

	// ============ GESTION DES CHAPITRES ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Patch(':coursId/sections/:sectionId/chapitres/:chapitreId')
	@ApiOperation({ summary: 'Mettre à jour un chapitre' })
	async updateChapitre(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Param('chapitreId') chapitreId: string,
		@Body() dto: UpdateChapitreDto,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.updateChapitre(coursId, sectionId, chapitreId, dto, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':coursId/sections/:sectionId/add-chapitre')
	@ApiOperation({ summary: 'Ajouter un chapitre à une section spécifique' })
	async addChapitreToSection(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Body() dto: AddChapitreToSectionDto,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.ajouterChapitreASection(coursId, sectionId, dto, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Delete(':coursId/sections/:sectionId/chapitres/:chapitreId')
	@ApiOperation({ summary: 'Supprimer un chapitre' })
	async deleteChapitre(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Param('chapitreId') chapitreId: string,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.supprimerChapitre(coursId, sectionId, chapitreId, user._id);
	}

	// ============ GESTION DES RESSOURCES ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':coursId/sections/:sectionId/chapitres/:chapitreId/ressources')
	@ApiOperation({ summary: 'Ajouter une ressource à un chapitre' })
	async addRessourceToChapitre(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Param('chapitreId') chapitreId: string,
		@Body() ressource: any,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.ajouterRessourceAChapitre(coursId, sectionId, chapitreId, ressource, user._id);
	}

	// ============ GESTION DES MÉDIAS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Put(':id/thumbnail')
	@ApiOperation({ summary: 'Mettre à jour le thumbnail d\'un cours' })
	async updateThumbnail(
		@Param('id') id: string,
		@Body('thumbnailUrl') thumbnailUrl: string,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.mettreAJourThumbnail(id, thumbnailUrl, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Put(':coursId/sections/:sectionId/chapitres/:chapitreId/video')
	@ApiOperation({ summary: 'Mettre à jour l\'URL vidéo d\'un chapitre' })
	async updateVideoUrl(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Param('chapitreId') chapitreId: string,
		@Body('videoUrl') videoUrl: string,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.mettreAJourVideoUrl(coursId, sectionId, chapitreId, videoUrl, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':coursId/sections/:sectionId/chapitres/:chapitreId/upload-video')
	@UseInterceptors(FileInterceptor('file'))
	@ApiOperation({ summary: 'Upload video for a chapter directly' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
			},
		},
	})
	async uploadChapterVideo(
		@Param('coursId') coursId: string,
		@Param('sectionId') sectionId: string,
		@Param('chapitreId') chapitreId: string,
		@UploadedFile() file: Express.Multer.File,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursContentService.uploadChapterVideo(coursId, sectionId, chapitreId, file, user._id);
	}

	// ============ INSCRIPTION AUX COURS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/enroll')
	@ApiOperation({ summary: 'S\'inscrire à un cours' })
	@ApiQuery({ name: 'promoCode', required: false, type: String })
	async enrollToCours(@Param('id') id: string, @Query('promoCode') promoCode: string | undefined, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursEnrollmentService.inscrireAuCours(id, user._id, promoCode);
	}

	// ============ VÉRIFICATION D'ACCÈS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':coursId/chapitres/:chapitreId/access')
	@ApiOperation({ summary: 'Vérifier l\'accès à un chapitre' })
	async checkChapterAccess(
		@Param('coursId') coursId: string,
		@Param('chapitreId') chapitreId: string,
		@Req() req,
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursEnrollmentService.verifierAccesChapitre(coursId, chapitreId, user._id);
	}





	// ============ PERMISSIONS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/permissions')
	@ApiOperation({ summary: 'Vérifier les permissions sur un cours' })
	async checkPermissions(@Param('id') id: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		const hasPermission = await this.coursContentService.verifierPermissionsCours(id, user._id);
		return { hasPermission };
	}

	// ============ TRACKING ENDPOINTS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/view')
	@ApiOperation({
		summary: 'Enregistrer une vue d\'un cours',
		description: 'Enregistre qu\'un utilisateur a visualisé un cours. Incrémente le compteur de vues.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	@ApiResponse({ status: 200, description: 'Vue enregistrée avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async trackView(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursView(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/start')
	@ApiOperation({
		summary: 'Démarrer un cours',
		description: 'Marque le début de la consommation d\'un cours par un utilisateur. Enregistre l\'heure de début.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	@ApiResponse({ status: 200, description: 'Démarrage enregistré avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async trackStart(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursStart(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/complete')
	@ApiOperation({
		summary: 'Marquer un cours comme terminé',
		description: 'Marque la fin de la consommation d\'un cours par un utilisateur. Enregistre l\'heure de fin et calcule la progression.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	@ApiResponse({ status: 200, description: 'Completion enregistrée avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async trackComplete(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursComplete(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Put(':id/track/watch-time')
	@ApiOperation({
		summary: 'Mettre à jour le temps de visionnage d\'un cours',
		description: 'Ajoute du temps de visionnage au cours. Utilisé pour tracker la progression en temps réel.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({
		type: UpdateIncrementalWatchTimeDto,
	})
	@ApiResponse({ status: 200, description: 'Temps de visionnage mis à jour avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async updateWatchTime(@Param('id') id: string, @Body() body: UpdateIncrementalWatchTimeDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursTrackingService.updateCoursWatchTime(id, user._id, body.additionalTime);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/like')
	@ApiOperation({
		summary: 'Enregistrer un like sur un cours',
		description: 'Enregistre qu\'un utilisateur a liké un cours. Incrémente le compteur de likes.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({ status: 200, description: 'Like enregistré avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	async trackLike(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursLike(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/share')
	@ApiOperation({
		summary: 'Enregistrer un partage d\'un cours',
		description: 'Enregistre qu\'un utilisateur a partagé un cours. Incrémente le compteur de partages.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({ status: 200, description: 'Partage enregistré avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	async trackShare(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursShare(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/download')
	@ApiOperation({
		summary: 'Enregistrer un téléchargement d\'un cours',
		description: 'Enregistre qu\'un utilisateur a téléchargé un cours. Incrémente le compteur de téléchargements.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({ status: 200, description: 'Téléchargement enregistré avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	@ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
	async trackDownload(@Param('id') id: string, @Req() req, @Body('metadata') metadata?: any) {
		const user = req.user as AuthenticatedUser;
		const enriched = enrichTrackingMetadata(req, metadata);
		return await this.coursTrackingService.trackCoursDownload(id, user._id, enriched);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/bookmark')
	@ApiOperation({
		summary: 'Ajouter un bookmark d\'un cours',
		description: 'Ajoute un cours aux favoris de l\'utilisateur avec un identifiant de bookmark personnalisé.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				bookmarkId: { type: 'string', description: 'Identifiant unique du bookmark' }
			},
			required: ['bookmarkId']
		}
	})
	@ApiResponse({ status: 200, description: 'Bookmark ajouté avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async addBookmark(@Param('id') id: string, @Body('bookmarkId') bookmarkId: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursTrackingService.addCoursBookmark(id, user._id, bookmarkId);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Delete(':id/track/bookmark/:bookmarkId')
	@ApiOperation({
		summary: 'Retirer un bookmark d\'un cours',
		description: 'Supprime un bookmark spécifique d\'un cours des favoris de l\'utilisateur.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiParam({ name: 'bookmarkId', description: 'ID du bookmark à supprimer', type: 'string' })
	@ApiResponse({ status: 200, description: 'Bookmark supprimé avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours ou bookmark non trouvé' })
	async removeBookmark(@Param('id') id: string, @Param('bookmarkId') bookmarkId: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursTrackingService.removeCoursBookmark(id, user._id, bookmarkId);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/track/rating')
	@ApiOperation({
		summary: 'Ajouter une note/évaluation d\'un cours',
		description: 'Permet à un utilisateur de noter et éventuellement commenter un cours.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				rating: { type: 'number', minimum: 1, maximum: 5, description: 'Note de 1 à 5' },
				review: { type: 'string', description: 'Commentaire optionnel' }
			},
			required: ['rating']
		}
	})
	@ApiResponse({ status: 200, description: 'Note ajoutée avec succès' })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	@ApiResponse({ status: 400, description: 'Note invalide (doit être entre 1 et 5)' })
	async addRating(@Param('id') id: string, @Body('rating') rating: number, @Req() req, @Body('review') review?: string) {
		const user = req.user as AuthenticatedUser;
		return await this.coursTrackingService.addCoursRating(id, user._id, rating, review);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/track/progress')
	@ApiOperation({
		summary: 'Obtenir la progression d\'un utilisateur pour un cours',
		description: 'Récupère les données de progression détaillées d\'un utilisateur pour un cours spécifique.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Progression récupérée avec succès',
		schema: {
			type: 'object',
			properties: {
				contentId: { type: 'string' },
				contentType: { type: 'string' },
				progress: {
					type: 'object',
					properties: {
						isCompleted: { type: 'boolean' },
						watchTime: { type: 'number' },
						progressPercentage: { type: 'number' },
						lastAccessedAt: { type: 'string', format: 'date-time' }
					}
				},
				actions: { type: 'array' },
				bookmarks: { type: 'array' },
				userRating: { type: 'number' },
				userReview: { type: 'string' }
			}
		}
	})
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async getProgress(@Param('id') id: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursTrackingService.getCoursProgress(id, user._id);
	}

	@Get(':id/track/stats')
	@ApiOperation({
		summary: 'Obtenir les statistiques d\'un cours',
		description: 'Récupère les statistiques publiques d\'un cours (vues, likes, partages, etc.).'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Statistiques récupérées avec succès',
		schema: {
			type: 'object',
			properties: {
				contentId: { type: 'string' },
				contentType: { type: 'string' },
				totalViews: { type: 'number' },
				totalLikes: { type: 'number' },
				totalShares: { type: 'number' },
				totalDownloads: { type: 'number' },
				totalBookmarks: { type: 'number' },
				averageRating: { type: 'number' },
				totalRatings: { type: 'number' },
				completionRate: { type: 'number' }
			}
		}
	})
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async getStats(@Param('id') id: string) {
		return await this.coursTrackingService.getCoursStats(id);
	}

	@Get(':id/reviews')
	@ApiOperation({
		summary: 'Obtenir tous les avis d\'un cours',
		description: 'Récupère tous les avis (ratings + reviews) d\'un cours avec les informations des utilisateurs.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({
		status: 200,
		description: 'Avis récupérés avec succès',
		schema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				reviews: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							user: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									name: { type: 'string' },
									email: { type: 'string' },
									avatar: { type: 'string' }
								}
							},
							rating: { type: 'number' },
							review: { type: 'string' },
							createdAt: { type: 'string', format: 'date-time' },
							updatedAt: { type: 'string', format: 'date-time' }
						}
					}
				},
				averageRating: { type: 'number' },
				totalRatings: { type: 'number' }
			}
		}
	})
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async getReviews(@Param('id') id: string) {
		return await this.coursTrackingService.getCoursReviews(id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get('user/progress')
	@ApiOperation({
		summary: 'Obtenir les progressions d\'un utilisateur pour tous ses cours',
		description: 'Récupère la liste paginée des progressions de l\'utilisateur connecté pour tous ses cours.'
	})
	@ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page (défaut: 1)' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page (défaut: 10)' })
	@ApiResponse({
		status: 200,
		description: 'Progressions récupérées avec succès',
		schema: {
			type: 'object',
			properties: {
				progress: { type: 'array' },
				pagination: {
					type: 'object',
					properties: {
						page: { type: 'number' },
						limit: { type: 'number' },
						total: { type: 'number' },
						pages: { type: 'number' }
					}
				}
			}
		}
	})
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	async getUserProgress(@Query('page') page = '1', @Query('limit') limit = '10', @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.getUserCoursProgress(user._id, Number(page) || 1, Number(limit) || 10);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get('user/actions/recent')
	@ApiOperation({
		summary: 'Obtenir les actions récentes d\'un utilisateur sur les cours',
		description: 'Récupère l\'historique des actions récentes de l\'utilisateur connecté sur les cours.'
	})
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'actions à récupérer (défaut: 20)' })
	@ApiResponse({
		status: 200,
		description: 'Actions récentes récupérées avec succès',
		schema: {
			type: 'object',
			properties: {
				actions: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							actionType: { type: 'string' },
							timestamp: { type: 'string', format: 'date-time' },
							contentId: { type: 'string' },
							contentType: { type: 'string' },
							metadata: { type: 'object' }
						}
					}
				}
			}
		}
	})
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	async getUserRecentActions(@Query('limit') limit = '20', @Req() req): Promise<any> {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.getUserCoursRecentActions(user._id, Number(limit) || 20);
	}

	// ============ SEQUENTIAL PROGRESSION ENDPOINTS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Patch(':id/sequential-progression')
	@ApiOperation({
		summary: 'Activer/désactiver la progression séquentielle d\'un cours',
		description: 'Permet au créateur du cours d\'activer ou désactiver la progression séquentielle. Quand activée, les utilisateurs doivent compléter le chapitre précédent pour accéder au suivant.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiBody({ type: UpdateSequentialProgressionDto })
	@ApiResponse({ status: 200, description: 'Progression séquentielle mise à jour avec succès' })
	@ApiResponse({ status: 403, description: 'Accès non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours non trouvé' })
	async updateSequentialProgression(
		@Param('id') id: string,
		@Body() dto: UpdateSequentialProgressionDto,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.updateSequentialProgression(
			id,
			dto.enabled,
			dto.unlockMessage,
			user._id
		);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/chapters/:chapterId/access')
	@ApiOperation({
		summary: 'Vérifier l\'accès à un chapitre avec progression séquentielle',
		description: 'Vérifie si l\'utilisateur peut accéder à un chapitre spécifique en tenant compte de la progression séquentielle.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiParam({ name: 'chapterId', description: 'ID du chapitre', type: 'string' })
	@ApiResponse({ status: 200, description: 'Accès vérifié avec succès', type: ChapterAccessResponseDto })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours, chapitre ou utilisateur non trouvé' })
	async checkChapterAccessWithSequential(
		@Param('id') id: string,
		@Param('chapterId') chapterId: string,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.checkChapterAccessWithSequential(id, chapterId, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/unlocked-chapters')
	@ApiOperation({
		summary: 'Obtenir les chapitres déverrouillés pour l\'utilisateur',
		description: 'Récupère la liste des chapitres déverrouillés pour l\'utilisateur connecté, avec leur statut de completion.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiResponse({ status: 200, description: 'Chapitres déverrouillés récupérés avec succès', type: UnlockedChaptersResponseDto })
	@ApiResponse({ status: 401, description: 'Non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours ou utilisateur non trouvé' })
	async getUnlockedChapters(
		@Param('id') id: string,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.getUnlockedChapters(id, user._id);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/course-session')
	@ApiOperation({
		summary: 'Get normalized course session state',
		description: 'Returns the full course session including all chapter access decisions, progression, and next-chapter action in a single response. This is the single source of truth for the frontend course player.',
	})
	@ApiParam({ name: 'id', description: 'Course ID', type: 'string' })
	@ApiQuery({ name: 'currentChapterId', required: false, type: String, description: 'Current chapter ID for next-action resolution' })
	@ApiResponse({ status: 200, description: 'Course session retrieved', type: CourseSessionDto })
	async getCourseSession(
		@Param('id') id: string,
		@Query('currentChapterId') currentChapterId: string | undefined,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.getCourseSession(id, user._id, currentChapterId || undefined);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/chapters/:chapterId/unlock')
	@ApiOperation({
		summary: 'Déverrouiller manuellement un chapitre',
		description: 'Permet au créateur du cours de déverrouiller manuellement un chapitre pour un utilisateur spécifique.'
	})
	@ApiParam({ name: 'id', description: 'ID du cours', type: 'string' })
	@ApiParam({ name: 'chapterId', description: 'ID du chapitre', type: 'string' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				userId: { type: 'string', description: 'ID de l\'utilisateur cible' }
			},
			required: ['userId']
		}
	})
	@ApiResponse({ status: 200, description: 'Chapitre déverrouillé avec succès' })
	@ApiResponse({ status: 403, description: 'Accès non autorisé' })
	@ApiResponse({ status: 404, description: 'Cours, chapitre ou utilisateur non trouvé' })
	async unlockChapterManually(
		@Param('id') id: string,
		@Param('chapterId') chapterId: string,
		@Body('userId') userId: string,
		@Req() req
	) {
		const user = req.user as AuthenticatedUser;
		return await this.coursProgressionService.unlockChapterManually(id, chapterId, userId, user._id);
	}

	// ============ USER NOTES ENDPOINTS ============

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Post(':id/notes')
	@ApiOperation({ summary: 'Create a user note for a course' })
	@ApiResponse({ status: 201, description: 'Note created', type: UserNoteResponseDto })
	async createNote(@Param('id') courseId: string, @Body() createDto: CreateUserNoteDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursNotesService.createUserNote(user._id, courseId, createDto);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Get(':id/notes')
	@ApiOperation({ summary: 'Get user notes for a course' })
	@ApiResponse({ status: 200, description: 'Notes retrieved', type: [UserNoteResponseDto] })
	async getNotes(@Param('id') courseId: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursNotesService.getUserNotes(user._id, courseId);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Put(':id/notes/:noteId')
	@ApiOperation({ summary: 'Update a user note' })
	@ApiResponse({ status: 200, description: 'Note updated', type: UserNoteResponseDto })
	async updateNote(@Param('id') courseId: string, @Param('noteId') noteId: string, @Body() updateDto: UpdateUserNoteDto, @Req() req) {
		const user = req.user as AuthenticatedUser;
		// courseId is not strictly needed for update if noteId is unique, but kept for consistency
		return await this.coursNotesService.updateUserNote(user._id, noteId, updateDto);
	}

	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('JWT-auth')
	@Delete(':id/notes/:noteId')
	@ApiOperation({ summary: 'Delete a user note' })
	@ApiResponse({ status: 200, description: 'Note deleted' })
	async deleteNote(@Param('id') courseId: string, @Param('noteId') noteId: string, @Req() req) {
		const user = req.user as AuthenticatedUser;
		return await this.coursNotesService.deleteUserNote(user._id, noteId);
	}
}

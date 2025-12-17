import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { ChallengeService } from './challenge.service';
import { CreateChallengeDto } from '../dto-challenge/create-challenge.dto';
import { UpdateChallengeDto } from '../dto-challenge/update-challenge.dto';
import { JoinChallengeDto, LeaveChallengeDto, UpdateProgressDto, CreateChallengePostDto, CreateChallengeCommentDto } from '../dto-challenge/join-challenge.dto';
import { ChallengeResponseDto, ChallengeListResponseDto } from '../dto-challenge/challenge-response.dto';
import {
  UpdateChallengePricingDto,
  CalculateChallengePriceDto,
  ChallengePriceCalculationResponseDto,
  CheckChallengeAccessDto,
  ChallengeAccessResponseDto
} from '../dto-challenge/challenge-pricing.dto';
import {
  UpdateChallengeSequentialProgressionDto,
  TaskAccessResponseDto,
  UnlockedTasksResponseDto
} from '../dto-challenge/sequential-progression.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Challenges')
@Controller('challenges')
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau défi' })
  @ApiResponse({ status: 201, description: 'Défi créé avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async create(
    @Body() createChallengeDto: CreateChallengeDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.create(createChallengeDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer tous les défis avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des défis récupérée avec succès', type: ChallengeListResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', example: 10 })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Slug de la communauté' })
  @ApiQuery({ name: 'category', required: false, description: 'Catégorie du défi' })
  @ApiQuery({ name: 'difficulty', required: false, description: 'Difficulté du défi' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Si le défi est actif' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communitySlug') communitySlug?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('isActive') isActive?: boolean
  ): Promise<ChallengeListResponseDto> {
    return this.challengeService.findAll(
      page,
      limit,
      communitySlug,
      category,
      difficulty,
      isActive
    );
  }

  @Get('community/:communitySlug')
  @ApiOperation({ summary: 'Récupérer les défis d\'une communauté' })
  @ApiResponse({ status: 200, description: 'Défis de la communauté récupérés avec succès', type: [ChallengeResponseDto] })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async findByCommunity(@Param('communitySlug') communitySlug: string): Promise<ChallengeResponseDto[]> {
    return this.challengeService.findByCommunity(communitySlug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un défi par son ID' })
  @ApiResponse({ status: 200, description: 'Défi récupéré avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async findOne(@Param('id') id: string): Promise<ChallengeResponseDto> {
    return this.challengeService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un défi' })
  @ApiResponse({ status: 200, description: 'Défi mis à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async update(
    @Param('id') id: string,
    @Body() updateChallengeDto: UpdateChallengeDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.update(id, updateChallengeDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un défi' })
  @ApiResponse({ status: 204, description: 'Défi supprimé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    return this.challengeService.remove(id, req.user.userId);
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rejoindre un défi' })
  @ApiResponse({ status: 200, description: 'Défi rejoint avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de rejoindre le défi' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async joinChallenge(
    @Body() joinChallengeDto: JoinChallengeDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.joinChallenge(joinChallengeDto, req.user.userId);
  }

  @Post('leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Quitter un défi' })
  @ApiResponse({ status: 200, description: 'Défi quitté avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de quitter le défi' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async leaveChallenge(
    @Body() leaveChallengeDto: LeaveChallengeDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.leaveChallenge(leaveChallengeDto, req.user.userId);
  }

  @Patch('progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le progrès d\'un participant' })
  @ApiResponse({ status: 200, description: 'Progrès mis à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de mettre à jour le progrès' })
  @ApiResponse({ status: 404, description: 'Défi ou tâche non trouvé' })
  async updateProgress(
    @Body() updateProgressDto: UpdateProgressDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.updateProgress(updateProgressDto, req.user.userId);
  }

  @Post(':challengeId/posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un post dans un défi' })
  @ApiResponse({ status: 201, description: 'Post créé avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de créer le post' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async createPost(
    @Param('challengeId') challengeId: string,
    @Body() createPostDto: CreateChallengePostDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.createPost(challengeId, createPostDto, req.user.userId);
  }

  @Post(':challengeId/posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Commenter un post de défi' })
  @ApiResponse({ status: 201, description: 'Commentaire créé avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de créer le commentaire' })
  @ApiResponse({ status: 404, description: 'Défi ou post non trouvé' })
  async commentPost(
    @Param('challengeId') challengeId: string,
    @Param('postId') postId: string,
    @Body() createCommentDto: CreateChallengeCommentDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.commentPost(challengeId, postId, createCommentDto, req.user.userId);
  }

  // ============= PRICING ENDPOINTS =============

  @Patch(':id/pricing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour la configuration de prix d\'un défi' })
  @ApiResponse({ status: 200, description: 'Configuration de prix mise à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async updatePricing(
    @Param('id') challengeId: string,
    @Body() updatePricingDto: UpdateChallengePricingDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.updatePricing(challengeId, updatePricingDto, req.user.userId);
  }

  @Post('calculate-price')
  @ApiOperation({ summary: 'Calculer le prix d\'un défi avec remises' })
  @ApiResponse({ status: 200, description: 'Prix calculé avec succès', type: ChallengePriceCalculationResponseDto })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async calculatePrice(
    @Body() calculatePriceDto: CalculateChallengePriceDto
  ): Promise<ChallengePriceCalculationResponseDto> {
    return this.challengeService.calculatePrice(calculatePriceDto);
  }

  @Post('check-access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier l\'accès d\'un utilisateur à un défi' })
  @ApiResponse({ status: 200, description: 'Accès vérifié avec succès', type: ChallengeAccessResponseDto })
  @ApiResponse({ status: 404, description: 'Défi ou utilisateur non trouvé' })
  async checkAccess(
    @Body() checkAccessDto: CheckChallengeAccessDto
  ): Promise<ChallengeAccessResponseDto> {
    return this.challengeService.checkAccess(checkAccessDto);
  }

  @Get('free')
  @ApiOperation({ summary: 'Récupérer les défis gratuits' })
  @ApiResponse({ status: 200, description: 'Liste des défis gratuits récupérée avec succès', type: ChallengeListResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', example: 10 })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Slug de la communauté' })
  async findFreeChallenges(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('communitySlug') communitySlug?: string
  ): Promise<ChallengeListResponseDto> {
    return this.challengeService.findFreeChallenges(page, limit, communitySlug);
  }

  @Get('user/my-participations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Récupérer les défis auxquels l\'utilisateur participe',
    description: 'Retourne tous les défis que l\'utilisateur a rejoint avec leur progression'
  })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Filtrer par slug de communauté' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'completed', 'all'], description: 'Statut des participations (default: all)' })
  @ApiResponse({
    status: 200,
    description: 'Participations récupérées avec succès',
    schema: {
      example: {
        success: true,
        data: {
          participations: [
            {
              challengeId: '507f1f77bcf86cd799439011',
              challenge: {
                id: '507f1f77bcf86cd799439011',
                title: '30-Day Coding Challenge',
                description: 'Complete 30 coding tasks in 30 days',
                thumbnail: 'https://example.com/challenge.jpg',
                category: 'Programming',
                difficulty: 'Intermediate',
                startDate: '2024-01-01T00:00:00.000Z',
                endDate: '2024-01-31T23:59:59.000Z',
                depositAmount: 50,
                completionReward: 75,
                communityId: '507f1f77bcf86cd799439012'
              },
              joinedAt: '2024-01-05T10:30:00.000Z',
              progress: 45,
              completedTasks: 9,
              totalTasks: 20,
              isActive: true,
              lastActivityAt: '2024-01-15T14:22:00.000Z'
            }
          ],
          total: 3
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getMyParticipations(
    @Request() req: any,
    @Query('communitySlug') communitySlug?: string,
    @Query('status') status?: string
  ): Promise<any> {
    return this.challengeService.getUserParticipations(
      req.user.userId,
      communitySlug,
      status || 'all'
    );
  }

  // Get challenges for a specific user (for profile viewing)
  @Get('by-user/:userId')
  @ApiOperation({ 
    summary: 'Get challenges for a specific user',
    description: 'Retrieve challenges associated with a user (participated + created)'
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, enum: ['participated', 'created', 'all'], description: 'Challenge type filter' })
  @ApiResponse({
    status: 200,
    description: 'User challenges retrieved successfully',
    content: {
      'application/json': {
        example: {
          success: true,
          message: 'User challenges retrieved successfully',
          data: {
            challenges: [
              {
                id: '1',
                title: 'JS Masters',
                description: 'Master JavaScript fundamentals',
                thumbnail: 'https://example.com/thumb.jpg',
                progress: 75,
                status: 'active',
                type: 'participated',
                category: 'Programming',
                difficulty: 'Intermediate'
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
  async getChallengesByUser(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('type') type: 'participated' | 'created' | 'all' = 'all'
  ) {
    return await this.challengeService.getChallengesByUser(
      userId, 
      Number(page) || 1, 
      Number(limit) || 10,
      type
    );
  }

  @Get('premium')
  @ApiOperation({ summary: 'Récupérer les défis premium' })
  @ApiResponse({ status: 200, description: 'Liste des défis premium récupérée avec succès', type: ChallengeListResponseDto })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'éléments par page', example: 10 })
  @ApiQuery({ name: 'communitySlug', required: false, description: 'Slug de la communauté' })
  async findPremiumChallenges(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('communitySlug') communitySlug?: string
  ): Promise<ChallengeListResponseDto> {
    return this.challengeService.findPremiumChallenges(page, limit, communitySlug);
  }

  // ============ TRACKING ENDPOINTS ============

  @Post(':id/track/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer une vue d\'un défi' })
  @ApiResponse({ status: 200, description: 'Vue enregistrée avec succès' })
  async trackView(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.trackChallengeView(id, req.user.userId);
  }

  @Post(':id/track/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrer un défi' })
  @ApiResponse({ status: 200, description: 'Défi démarré avec succès' })
  async trackStart(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.trackChallengeStart(id, req.user.userId);
  }

  @Post(':id/track/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer un défi comme terminé' })
  @ApiResponse({ status: 200, description: 'Défi marqué comme terminé' })
  async trackComplete(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.trackChallengeComplete(id, req.user.userId);
  }

  @Post(':id/track/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un like sur un défi' })
  @ApiResponse({ status: 200, description: 'Like enregistré avec succès' })
  async trackLike(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.trackChallengeLike(id, req.user.userId);
  }

  @Post(':id/track/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un partage d\'un défi' })
  @ApiResponse({ status: 200, description: 'Partage enregistré avec succès' })
  async trackShare(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.trackChallengeShare(id, req.user.userId);
  }

  @Post(':id/track/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter un bookmark d\'un défi' })
  @ApiResponse({ status: 200, description: 'Bookmark ajouté avec succès' })
  async addBookmark(@Param('id') id: string, @Body('bookmarkId') bookmarkId: string, @Request() req: any) {
    return this.challengeService.addChallengeBookmark(id, req.user.userId, bookmarkId);
  }

  @Delete(':id/track/bookmark/:bookmarkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un bookmark d\'un défi' })
  @ApiResponse({ status: 200, description: 'Bookmark retiré avec succès' })
  async removeBookmark(@Param('id') id: string, @Param('bookmarkId') bookmarkId: string, @Request() req: any) {
    return this.challengeService.removeChallengeBookmark(id, req.user.userId, bookmarkId);
  }

  @Post(':id/track/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter une note/évaluation d\'un défi' })
  @ApiResponse({ status: 200, description: 'Note ajoutée avec succès' })
  async addRating(@Param('id') id: string, @Body('rating') rating: number, @Request() req: any, @Body('review') review?: string) {
    return this.challengeService.addChallengeRating(id, req.user.userId, rating, review);
  }

  @Get(':id/track/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir la progression d\'un utilisateur pour un défi' })
  @ApiResponse({ status: 200, description: 'Progression récupérée avec succès' })
  async getProgress(@Param('id') id: string, @Request() req: any) {
    return this.challengeService.getChallengeProgress(id, req.user.userId);
  }

  @Get(':id/track/stats')
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un défi' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès' })
  async getStats(@Param('id') id: string) {
    return this.challengeService.getChallengeStats(id);
  }

  // ============ SEQUENTIAL PROGRESSION ENDPOINTS ============

  @Patch(':id/sequential-progression')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activer/désactiver la progression séquentielle d\'un défi',
    description: 'Permet au créateur du défi d\'activer ou désactiver la progression séquentielle. Quand activée, les utilisateurs doivent compléter la tâche précédente pour accéder à la suivante.'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiBody({ type: UpdateChallengeSequentialProgressionDto })
  @ApiResponse({ status: 200, description: 'Progression séquentielle mise à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async updateSequentialProgression(
    @Param('id') id: string,
    @Body() dto: UpdateChallengeSequentialProgressionDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.updateSequentialProgression(
      id,
      dto.enabled,
      dto.unlockMessage,
      req.user.userId
    );
  }

  @Get(':id/tasks/:taskId/access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vérifier l\'accès à une tâche avec progression séquentielle',
    description: 'Vérifie si l\'utilisateur peut accéder à une tâche spécifique en tenant compte de la progression séquentielle.'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiParam({ name: 'taskId', description: 'ID de la tâche', type: 'string' })
  @ApiResponse({ status: 200, description: 'Accès vérifié avec succès', type: TaskAccessResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi, tâche ou utilisateur non trouvé' })
  async checkTaskAccessWithSequential(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Request() req: any
  ): Promise<TaskAccessResponseDto> {
    return this.challengeService.checkTaskAccessWithSequential(id, taskId, req.user.userId);
  }

  @Get(':id/unlocked-tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir les tâches déverrouillées pour l\'utilisateur',
    description: 'Récupère la liste des tâches déverrouillées pour l\'utilisateur connecté, avec leur statut de completion.'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiResponse({ status: 200, description: 'Tâches déverrouillées récupérées avec succès', type: UnlockedTasksResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi ou utilisateur non trouvé' })
  async getUnlockedTasks(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<UnlockedTasksResponseDto> {
    return this.challengeService.getUnlockedTasks(id, req.user.userId);
  }

  @Post(':id/tasks/:taskId/unlock')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Déverrouiller manuellement une tâche',
    description: 'Permet au créateur du défi de déverrouiller manuellement une tâche pour un utilisateur spécifique.'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiParam({ name: 'taskId', description: 'ID de la tâche', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID de l\'utilisateur cible' }
      },
      required: ['userId']
    }
  })
  @ApiResponse({ status: 200, description: 'Tâche déverrouillée avec succès' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi, tâche ou utilisateur non trouvé' })
  async unlockTaskManually(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body('userId') userId: string,
    @Request() req: any
  ): Promise<{ message: string }> {
    return this.challengeService.unlockTaskManually(id, taskId, userId, req.user.userId);
  }

  @Patch('progress/sequential')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mettre à jour le progrès d\'un participant avec vérification séquentielle',
    description: 'Met à jour le progrès d\'un participant en vérifiant d\'abord l\'accès séquentiel à la tâche.'
  })
  @ApiBody({ type: UpdateProgressDto })
  @ApiResponse({ status: 200, description: 'Progrès mis à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible de mettre à jour le progrès' })
  @ApiResponse({ status: 403, description: 'Accès refusé - progression séquentielle requise' })
  @ApiResponse({ status: 404, description: 'Défi ou tâche non trouvé' })
  async updateProgressWithSequential(
    @Body() updateProgressDto: UpdateProgressDto,
    @Request() req: any
  ): Promise<ChallengeResponseDto> {
    return this.challengeService.updateProgressWithSequential(updateProgressDto, req.user.userId);
  }
}

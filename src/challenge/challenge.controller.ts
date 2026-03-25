import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { ChallengeService } from './challenge.service';
import { CreateChallengeDto } from '../dto-challenge/create-challenge.dto';
import { UpdateChallengeTasksDto } from '../dto-challenge/update-challenge-tasks.dto';
import { UpdateChallengeDto } from '../dto-challenge/update-challenge.dto';
import { ChallengeSubmission, ChallengeSubmissionSchema } from '../schema/challenge-submission.schema';
import { CreateSubmissionDto, ReviewSubmissionDto } from '../dto-challenge/challenge-submission.dto';
import {
  JoinChallengeDto,
  LeaveChallengeDto,
  UpdateProgressDto,
  CreateChallengePostDto,
  CreateChallengeCommentDto
} from '../dto-challenge/join-challenge.dto';
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';
import { PlanFeatureGuard, RequireFeature } from '../common/guards/plan-feature.guard';

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

@ApiTags('Challenges')
@Controller('challenges')
@UseInterceptors(HttpCacheInterceptor)
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) { }

  private getRequestUserId(req: any): string {
    return (
      req?.user?._id ||
      req?.user?.userId ||
      req?.user?.sub ||
      req?.user?.id ||
      ''
    ).toString();
  }

  // ============================================================
  // STATIC ROUTES (no :id param) — must come BEFORE @Get(':id')
  // ============================================================

  @Post()
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard, PlanFeatureGuard)
  @RequireFeature('challenges')
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getUserParticipations(
      userId,
      communitySlug,
      status || 'all'
    );
  }

  // Get challenges for a specific user (for profile viewing)
  @Get('by-user/:userId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get challenges for a specific user',
    description: 'Retrieve challenges associated with a user (participated + created)'
  })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, enum: ['participated', 'created', 'all'], description: 'Challenge type filter' })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: 'Filter by community ID' })
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
    @Query('type') type: 'participated' | 'created' | 'all' = 'all',
    @Query('communityId') communityId?: string,
    @Request() req?: any,
  ) {
    const requesterId = this.getRequestUserId(req);
    const visibilityScope = requesterId && requesterId === userId ? 'owner' : 'public';
    return await this.challengeService.getChallengesByUser(
      userId,
      Number(page) || 1,
      Number(limit) || 10,
      type,
      communityId,
      visibilityScope,
    );
  }

  // Static POST/PATCH routes (no :id param)

  @Post('project-submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soumettre un projet pour une tâche' })
  @ApiResponse({ status: 201, description: 'Soumission créée avec succès' })
  async submitProject(
    @Body() createSubmissionDto: CreateSubmissionDto,
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    console.log(`🚀 [CHALLENGE-CONTROLLER] Received submission for task ${createSubmissionDto.taskId} from user ${userId}`);
    return this.challengeService.submitProject(createSubmissionDto, userId);
  }

  @Patch('submissions/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review a project submission' })
  async reviewSubmission(
    @Param('id') submissionId: string,
    @Body() reviewDto: ReviewSubmissionDto,
    @Request() req: any
  ) {
    const adminId = req.user._id || req.user.userId;
    return this.challengeService.reviewSubmission(submissionId, reviewDto, adminId, req.user);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.joinChallenge(joinChallengeDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.leaveChallenge(leaveChallengeDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.updateProgress(updateProgressDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.updateProgressWithSequential(updateProgressDto, userId);
  }

  // ============================================================
  // PARAMETERIZED SUB-ROUTES (:id/...) — must come BEFORE @Get(':id')
  // ============================================================

  @Get(':id/leaderboard')
  @ApiOperation({
    summary: 'Obtenir le classement d\'un défi',
    description: 'Retourne le classement des participants triés par points et progression'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre d\'entrées à retourner (défaut: 50)', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Classement récupéré avec succès',
    schema: {
      example: {
        success: true,
        data: {
          leaderboard: [
            {
              rank: 1,
              oderId: '507f1f77bcf86cd799439011',
              odId: '507f1f77bcf86cd799439011',
              name: 'John Doe',
              avatar: 'https://example.com/avatar.jpg',
              totalPoints: 150,
              progress: 75,
              completedTasks: 15,
              streak: 5,
              joinedAt: '2024-01-15T10:30:00.000Z'
            }
          ],
          totalParticipants: 25,
          challengeId: '507f1f77bcf86cd799439012'
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async getLeaderboard(
    @Param('id') id: string,
    @Query('limit') limit: number = 50
  ) {
    return this.challengeService.getChallengeLeaderboard(id, limit);
  }

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les soumissions d\'un défi' })
  async getSubmissions(
    @Param('id') challengeId: string,
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getSubmissions(challengeId, userId);
  }

  @Get(':id/submissions/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer toutes les soumissions d\'un défi (créateur/admin)' })
  async getAllSubmissionsForCreator(
    @Param('id') challengeId: string,
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getAllSubmissionsForCreator(challengeId, userId, req.user);
  }

  @Get(':id/track/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtenir la progression d\'un utilisateur pour un défi' })
  @ApiResponse({ status: 200, description: 'Progression récupérée avec succès' })
  async getProgress(@Param('id') id: string, @Request() req: any) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getChallengeProgress(id, userId);
  }

  @Get(':id/track/stats')
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un défi' })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès' })
  async getStats(@Param('id') id: string) {
    return this.challengeService.getChallengeStats(id);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtenir les analytics détaillées d\'un défi',
    description: 'Retourne des statistiques complètes incluant participants, progression, tâches, revenus et tendances'
  })
  @ApiParam({ name: 'id', description: 'ID du défi', type: 'string' })
  @ApiQuery({ name: 'from', required: false, description: 'Date de début (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'Date de fin (ISO)' })
  @ApiResponse({
    status: 200,
    description: 'Analytics récupérées avec succès',
    schema: {
      example: {
        overview: {
          totalParticipants: 45,
          activeParticipants: 38,
          completionRate: 67,
          averageProgress: 72,
          totalRevenue: 2250,
          totalTasks: 30,
          completedTasksTotal: 890
        },
        participantStats: {
          byStatus: { active: 38, inactive: 7 },
          byProgress: { notStarted: 5, inProgress: 25, completed: 15 },
          joinTrend: [{ date: '2024-01-01', count: 5 }],
          topPerformers: []
        },
        taskStats: {
          completionByTask: [],
          averageCompletionTime: 2.5,
          mostDifficultTasks: [],
          easiestTasks: []
        },
        engagementStats: {
          views: 1200,
          likes: 89,
          shares: 34,
          posts: 156,
          comments: 423
        },
        revenueStats: {
          totalRevenue: 2250,
          participationFees: 1800,
          deposits: 450,
          refunds: 0
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async getChallengeAnalytics(
    @Param('id') id: string,
    @Request() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    // Try multiple possible user ID fields from JWT
    const userId = req.user._id || req.user.userId || req.user.sub || req.user.id;
    console.log('🔧 DEBUG - getChallengeAnalytics Controller');
    console.log(`   👤 req.user:`, JSON.stringify(req.user, null, 2));
    console.log(`   👤 Extracted userId: ${userId}`);

    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 3600 * 1000);
    return this.challengeService.getChallengeAnalytics(id, userId, fromDate, toDate);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.checkTaskAccessWithSequential(id, taskId, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getUnlockedTasks(id, userId);
  }

  @Get(':id/rewards/eligibility')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calculer l\'éligibilité des récompenses d\'un défi (créateur/admin)' })
  async getRewardEligibility(
    @Param('id') id: string,
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.getRewardEligibility(id, userId, req.user);
  }

  // ============================================================
  // GENERIC WILDCARD ROUTE — MUST be LAST among GET :id routes
  // ============================================================

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un défi par son ID' })
  @ApiResponse({ status: 200, description: 'Défi récupéré avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async findOne(@Param('id') id: string): Promise<ChallengeResponseDto> {
    return this.challengeService.findOne(id);
  }

  // ============================================================
  // MUTATION ROUTES (:id param — POST/PATCH/PUT/DELETE)
  // These use different HTTP methods so ordering doesn't conflict
  // ============================================================

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Challenge', paramName: 'id' })
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.update(id, updateChallengeDto, userId);
  }

  @Put(':id/tasks')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Challenge', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour uniquement les tâches d\'un défi' })
  @ApiResponse({ status: 200, description: 'Tâches mises à jour avec succès', type: ChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async updateTasks(
    @Param('id') id: string,
    @Body() updateTasksDto: UpdateChallengeTasksDto,
    @Request() req: any,
  ): Promise<ChallengeResponseDto> {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.updateTasks(id, updateTasksDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Challenge', paramName: 'id' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un défi' })
  @ApiResponse({ status: 204, description: 'Défi supprimé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès non autorisé' })
  @ApiResponse({ status: 404, description: 'Défi non trouvé' })
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.remove(id, userId);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.CONTENT_MANAGE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Challenge', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publier un défi en brouillon (créateur uniquement)' })
  async publishChallenge(
    @Param('id') id: string,
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.publishChallenge(id, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.createPost(challengeId, createPostDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.commentPost(challengeId, postId, createCommentDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.updatePricing(challengeId, updatePricingDto, userId);
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
    const userId = req.user._id || req.user.userId;
    return this.challengeService.updateSequentialProgression(
      id,
      dto.enabled,
      dto.unlockMessage,
      userId
    );
  }

  // ============ TRACKING ENDPOINTS ============

  @Post(':id/track/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer une vue d\'un défi' })
  @ApiResponse({ status: 200, description: 'Vue enregistrée avec succès' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackView(@Param('id') id: string, @Request() req: any, @Body('metadata') metadata?: any) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackChallengeView(id, userId, enriched);
  }

  @Post(':id/track/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrer un défi' })
  @ApiResponse({ status: 200, description: 'Défi démarré avec succès' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackStart(@Param('id') id: string, @Request() req: any, @Body('metadata') metadata?: any) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackChallengeStart(id, userId, enriched);
  }

  @Post(':id/track/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer un défi comme terminé' })
  @ApiResponse({ status: 200, description: 'Défi marqué comme terminé' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackComplete(@Param('id') id: string, @Request() req: any, @Body('metadata') metadata?: any) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackChallengeComplete(id, userId, enriched);
  }

  @Post(':id/track/task-complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer une tâche comme terminée' })
  @ApiResponse({ status: 200, description: 'Tâche marquée comme terminée' })
  @ApiBody({ schema: { type: 'object', properties: { taskId: { type: 'string' }, metadata: { type: 'object' } } } })
  async trackTaskComplete(
    @Param('id') id: string,
    @Body('taskId') taskId: string,
    @Request() req: any,
    @Body('metadata') metadata?: any
  ) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackTaskComplete(id, taskId, userId, enriched);
  }

  @Post(':id/track/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un like sur un défi' })
  @ApiResponse({ status: 200, description: 'Like enregistré avec succès' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackLike(@Param('id') id: string, @Request() req: any, @Body('metadata') metadata?: any) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackChallengeLike(id, userId, enriched);
  }

  @Post(':id/track/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer un partage d\'un défi' })
  @ApiResponse({ status: 200, description: 'Partage enregistré avec succès' })
  @ApiBody({ schema: { type: 'object', properties: { metadata: { type: 'object' } } } })
  async trackShare(@Param('id') id: string, @Request() req: any, @Body('metadata') metadata?: any) {
    const userId = req.user._id || req.user.userId;
    const enriched = enrichTrackingMetadata(req, metadata);
    return this.challengeService.trackChallengeShare(id, userId, enriched);
  }

  @Post(':id/track/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter un bookmark d\'un défi' })
  @ApiResponse({ status: 200, description: 'Bookmark ajouté avec succès' })
  async addBookmark(@Param('id') id: string, @Body('bookmarkId') bookmarkId: string, @Request() req: any) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.addChallengeBookmark(id, userId, bookmarkId);
  }

  @Delete(':id/track/bookmark/:bookmarkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un bookmark d\'un défi' })
  @ApiResponse({ status: 200, description: 'Bookmark retiré avec succès' })
  async removeBookmark(@Param('id') id: string, @Param('bookmarkId') bookmarkId: string, @Request() req: any) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.removeChallengeBookmark(id, userId, bookmarkId);
  }

  @Post(':id/track/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter une note/évaluation d\'un défi' })
  @ApiResponse({ status: 200, description: 'Note ajoutée avec succès' })
  async addRating(@Param('id') id: string, @Body('rating') rating: number, @Request() req: any, @Body('review') review?: string) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.addChallengeRating(id, userId, rating, review);
  }

  // ============ REWARDS ENDPOINTS ============

  @Post(':id/rewards/distribute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Distribuer manuellement les récompenses d\'un défi (créateur/admin)' })
  async distributeRewards(
    @Param('id') id: string,
    @Body() body: { idempotencyKey: string; payouts?: Array<{ userId: string; rewardType: 'completion' | 'top_performer' | 'streak'; amount: number }> },
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.distributeRewards(id, userId, req.user, body);
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
    @Body('userId') targetUserId: string,
    @Request() req: any
  ): Promise<{ message: string }> {
    const userId = req.user._id || req.user.userId;
    return this.challengeService.unlockTaskManually(id, taskId, targetUserId, userId);
  }
}

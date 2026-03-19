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
  UseInterceptors,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PostService } from './post.service';
import { CreatePostDto } from '../dto-post/create-post.dto';
import { UpdatePostDto } from '../dto-post/update-post.dto';
import { CreatePostCommentDto } from '../dto-post/create-post.dto';
import { ReactPostDto } from '../dto-post/react-post.dto';
import {
  PostResponseDto,
  PostListResponseDto,
  PostCommentResponseDto,
  PostStatsResponseDto,
  PostShareMetaResponseDto,
} from '../dto-post/post-response.dto';
import { SharePostRequestDto } from '../dto-post/share-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HttpCacheInterceptor } from '../common/interceptors/cache.interceptor';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission, CommunityIdFrom } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('Posts')
@Controller('posts')
@UseInterceptors(HttpCacheInterceptor)
export class PostController {
  private readonly logger = new Logger(PostController.name);
  private readonly isDebugLoggingEnabled = process.env.NODE_ENV !== 'production';

  constructor(private readonly postService: PostService) {}

  private resolveRequestUserId(req?: any, explicitUserId?: string): string | undefined {
    const rawUserId = explicitUserId
      || req?.user?._id
      || req?.user?.userId
      || req?.user?.sub
      || req?.user?.id;
    if (!rawUserId) return undefined;
    const normalizedUserId = String(rawUserId).trim();
    return normalizedUserId.length > 0 ? normalizedUserId : undefined;
  }

  private assertDebugEndpointsEnabled(): void {
    const explicitlyEnabled = process.env.ENABLE_POST_DEBUG_ENDPOINTS === 'true';
    if (process.env.NODE_ENV === 'production' && !explicitlyEnabled) {
      throw new NotFoundException();
    }
  }

  private serializeLogArg(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  private logDebug(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled) return;
    this.logger.debug(args.map((arg) => this.serializeLogArg(arg)).join(' '));
  }

  private logError(...args: unknown[]): void {
    this.logger.error(args.map((arg) => this.serializeLogArg(arg)).join(' '));
  }

  private resolveRequestIpAddress(req: any): string | undefined {
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
  }

  private resolveTrackingMetadata(req: any): Record<string, any> {
    const userAgent = typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    const ipAddress = this.resolveRequestIpAddress(req);
    const metadata: Record<string, any> = {};
    if (userAgent) metadata.userAgent = userAgent;
    if (ipAddress) metadata.ipAddress = ipAddress;
    return metadata;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau post' })
  @ApiResponse({
    status: 201,
    description: 'Post créé avec succès',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas membre de la communauté' })
  @ApiResponse({ status: 404, description: 'Communauté non trouvée' })
  async create(
    @Body() createPostDto: CreatePostDto,
    @Request() req,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    this.logDebug('Create post request received', {
      body: createPostDto,
      userId,
      user: req.user
    });

    if (!userId) throw new UnauthorizedException();

    const post = await this.postService.create(createPostDto, userId);
    return { success: true, data: post };
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer la liste des posts' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Numéro de page',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: "Nombre d'éléments par page",
  })
  @ApiQuery({
    name: 'communityId',
    required: false,
    type: String,
    description: 'ID de la communauté',
  })
  @ApiQuery({
    name: 'authorId',
    required: false,
    type: String,
    description: "ID de l'auteur",
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    type: [String],
    description: 'Tags à filtrer',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Terme de recherche',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'ID de l\'utilisateur pour vérifier les likes',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des posts récupérée avec succès',
    type: PostListResponseDto,
  })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communityId') communityId?: string,
    @Query('authorId') authorId?: string,
    @Query('tags') tags?: string,
    @Query('search') search?: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    const tagsArray = tags ? tags.split(',') : undefined;
    // Try to get userId from query param, or from authenticated user
    const effectiveUserId = this.resolveRequestUserId(req, userId);
    const posts = await this.postService.findAll(
      page || 1,
      limit || 10,
      communityId,
      authorId,
      tagsArray,
      search,
      effectiveUserId,
    );
    return { success: true, data: posts };
  }

  @Get('user/bookmarks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Récupérer les posts favoris de l'utilisateur" })
  @ApiResponse({
    status: 200,
    description: 'Posts favoris récupérés avec succès',
    type: PostListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getUserBookmarks(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const bookmarks = await this.postService.getUserBookmarks(
      userId,
      page || 1,
      limit || 20,
    );
    return { success: true, data: bookmarks };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Récupérer les posts d'un utilisateur" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'communityId', required: false, type: String, description: "Filtrer par communauté" })
  @ApiQuery({ name: 'currentUserId', required: false, type: String, description: 'ID de l\'utilisateur connecté pour vérifier les likes' })
  @ApiResponse({
    status: 200,
    description: "Posts de l'utilisateur récupérés avec succès",
    type: PostListResponseDto,
  })
  async findByUser(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('communityId') communityId?: string,
    @Query('currentUserId') currentUserId?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    // Try to get currentUserId from query param, or from authenticated user
    const effectiveUserId = this.resolveRequestUserId(req, currentUserId);
    const posts = await this.postService.findByUser(
      userId,
      page || 1,
      limit || 10,
      communityId,
      effectiveUserId,
    );
    return { success: true, data: posts };
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: "Récupérer les posts d'une communauté" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'ID de l\'utilisateur pour vérifier les likes' })
  @ApiResponse({
    status: 200,
    description: 'Posts de la communauté récupérés avec succès',
    type: PostListResponseDto,
  })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    this.logDebug('Find posts by community request', {
      communityId,
      page: page || 1,
      limit: limit || 10,
      userId
    });

    try {
      // Validate input parameters
      if (!communityId || communityId.trim() === '') {
        throw new Error('Community ID is required');
      }

      // Try to get userId from query param, or from authenticated user
      const effectiveUserId = this.resolveRequestUserId(req, userId);

      const posts = await this.postService.findByCommunity(
        communityId.trim(),
        page || 1,
        limit || 10,
        effectiveUserId,
      );
      this.logDebug('Successfully found posts by community', { count: posts.posts.length });
      return { success: true, data: posts };
    } catch (error: any) {
      this.logError('Error in findByCommunity', {
        error: error.message,
        stack: error.stack,
        communityId,
        page,
        limit
      });
      
      // Return a graceful error response instead of throwing
      return {
        success: false,
        data: {
          posts: [],
          pagination: {
            page: page || 1,
            limit: limit || 10,
            total: 0,
            totalPages: 0,
          },
        },
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un post par son ID' })
  @ApiResponse({
    status: 200,
    description: 'Post récupéré avec succès',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async findOne(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const post = await this.postService.findOne(id);
    return { success: true, data: post };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un post' })
  @ApiResponse({
    status: 200,
    description: 'Post mis à jour avec succès',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: "Pas l'auteur du post" })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Request() req,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const post = await this.postService.update(
      id,
      updatePostDto,
      userId,
    );
    return { success: true, data: post };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un post' })
  @ApiResponse({ status: 200, description: 'Post supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: "Pas l'auteur du post" })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async remove(
    @Param('id') id: string,
    @Request() req,
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const result = await this.postService.remove(id, userId);
    return { success: true, message: result.message };
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Récupérer les commentaires d\'un post' })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'ID de l\'utilisateur pour vérifier les droits de modification',
  })
  @ApiResponse({
    status: 200,
    description: 'Commentaires récupérés avec succès',
    type: [PostCommentResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async getComments(
    @Param('id') postId: string,
    @Query('userId') userId?: string,
  ): Promise<{ success: boolean; data: PostCommentResponseDto[] }> {
    const comments = await this.postService.getComments(postId, userId);
    return { success: true, data: comments };
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un commentaire à un post' })
  @ApiResponse({
    status: 201,
    description: 'Commentaire ajouté avec succès',
    type: PostCommentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Pas membre de la communauté' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async addComment(
    @Param('id') postId: string,
    @Body() createCommentDto: CreatePostCommentDto,
    @Request() req,
  ): Promise<{ success: boolean; data: PostCommentResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const comment = await this.postService.addComment(
      postId,
      createCommentDto,
      userId,
    );
    return { success: true, data: comment };
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.POSTS_MODERATE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Post', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un commentaire' })
  @ApiResponse({ status: 200, description: 'Commentaire supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: "Pas l'auteur du commentaire" })
  @ApiResponse({ status: 404, description: 'Post ou commentaire non trouvé' })
  async removeComment(
    @Param('id') postId: string,
    @Param('commentId') commentId: string,
    @Request() req,
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const result = await this.postService.removeComment(
      postId,
      commentId,
      userId,
    );
    return { success: true, message: result.message };
  }

  @Patch(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un commentaire' })
  @ApiResponse({
    status: 200,
    description: 'Commentaire mis à jour avec succès',
    type: PostCommentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: "Pas l'auteur du commentaire" })
  @ApiResponse({ status: 404, description: 'Post ou commentaire non trouvé' })
  async updateComment(
    @Param('id') postId: string,
    @Param('commentId') commentId: string,
    @Body('content') content: string,
    @Request() req,
  ): Promise<{ success: boolean; data: PostCommentResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    const comment = await this.postService.updateComment(
      postId,
      commentId,
      content,
      userId,
    );
    return { success: true, data: comment };
  }

  @Post(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un post aux favoris' })
  @ApiResponse({ status: 200, description: 'Post ajouté aux favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async bookmarkPost(
    @Param('id') id: string,
    @Request() req,
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    await this.postService.bookmarkPost(id, userId, this.resolveTrackingMetadata(req));
    return { success: true, message: 'Post ajouté aux favoris' };
  }

  @Delete(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer un post des favoris' })
  @ApiResponse({ status: 200, description: 'Post retiré des favoris' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async unbookmarkPost(
    @Param('id') id: string,
    @Request() req,
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();
    await this.postService.unbookmarkPost(id, userId);
    return { success: true, message: 'Post retiré des favoris' };
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liker un post' })
  @ApiResponse({
    status: 200,
    description: 'Post liké avec succès',
    type: PostStatsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Post déjà liké' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async likePost(
    @Param('id') postId: string,
    @Request() req,
  ): Promise<{ success: boolean; data: PostStatsResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) {
      throw new UnauthorizedException();
    }
    const stats = await this.postService.likePost(postId, userId, this.resolveTrackingMetadata(req));
    return { success: true, data: stats };
  }

  @Post(':id/unlike')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unliker un post' })
  @ApiResponse({
    status: 200,
    description: 'Post unliké avec succès',
    type: PostStatsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Post pas liké' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async unlikePost(
    @Param('id') postId: string,
    @Request() req,
  ): Promise<{ success: boolean; data: PostStatsResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) {
      throw new UnauthorizedException();
    }
    const stats = await this.postService.unlikePost(postId, userId);
    return { success: true, data: stats };
  }

  @Post(':id/react')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter/retirer une réaction emoji' })
  @ApiResponse({
    status: 200,
    description: 'Réaction mise à jour avec succès',
    type: PostResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Emoji invalide' })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async reactToPost(
    @Param('id') postId: string,
    @Body() reactPostDto: ReactPostDto,
    @Request() req,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();

    const post = await this.postService.reactToPost(postId, reactPostDto.emoji, userId);
    return { success: true, data: post };
  }

  @Patch(':id/pin')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.POSTS_MODERATE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Post', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Épingler un post dans la communauté' })
  @ApiResponse({ status: 200, description: 'Post épinglé', type: PostResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Action réservée au créateur' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async pinPost(
    @Param('id') postId: string,
    @Request() req,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();

    const post = await this.postService.pinPost(postId, userId);
    return { success: true, data: post };
  }

  @Patch(':id/unpin')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.POSTS_MODERATE)
  @CommunityIdFrom({ type: 'entity', modelName: 'Post', paramName: 'id' })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désépingler un post dans la communauté' })
  @ApiResponse({ status: 200, description: 'Post désépinglé', type: PostResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 403, description: 'Action réservée au créateur' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async unpinPost(
    @Param('id') postId: string,
    @Request() req,
  ): Promise<{ success: boolean; data: PostResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) throw new UnauthorizedException();

    const post = await this.postService.unpinPost(postId, userId);
    return { success: true, data: post };
  }

  @Post(':id/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Partager un post' })
  @ApiResponse({ status: 200, description: 'Post partagé avec succès', type: PostStatsResponseDto })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async sharePost(
    @Param('id') postId: string,
    @Body() shareRequestDto: SharePostRequestDto,
    @Request() req,
  ): Promise<{ success: boolean; data: PostStatsResponseDto }> {
    const userId = this.resolveRequestUserId(req);
    if (!userId) {
      throw new UnauthorizedException();
    }
    const stats = await this.postService.sharePost(postId, userId, {
      ...this.resolveTrackingMetadata(req),
      ...(shareRequestDto?.method ? { shareMethod: shareRequestDto.method } : {}),
      ...(shareRequestDto?.targetUrl ? { targetUrl: shareRequestDto.targetUrl } : {}),
    });
    return { success: true, data: stats };
  }

  @Get(':id/share')
  @ApiOperation({ summary: 'Récupérer les métadonnées de partage d\'un post' })
  @ApiResponse({ status: 200, description: 'Métadonnées de partage récupérées', type: PostShareMetaResponseDto })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async getPostShareMeta(
    @Param('id') postId: string,
  ): Promise<{ success: boolean; data: PostShareMetaResponseDto }> {
    const data = await this.postService.getPostShareMeta(postId);
    return { success: true, data };
  }

  @Get('debug/count')
  @ApiOperation({ summary: 'Compter tous les posts (debug)' })
  @ApiResponse({ status: 200, description: 'Nombre de posts' })
  async getPostsCount(): Promise<{ success: boolean; data: { total: number } }> {
    this.assertDebugEndpointsEnabled();
    try {
      const total = await this.postService.countAllPosts();
      return { success: true, data: { total } };
    } catch (error) {
      this.logError('Error counting posts', error);
      throw error;
    }
  }

  @Post('debug/create-sample')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Créer un post de test (debug)' })
  @ApiResponse({ status: 201, description: 'Post de test créé' })
  async createSamplePost(@Request() req): Promise<{ success: boolean; data: any }> {
    this.assertDebugEndpointsEnabled();
    try {
      this.logDebug('Creating sample post for user', req.user);

      // Create a sample post using the authenticated user
      const samplePostData = {
        title: 'Test Post',
        content: 'This is a test post to verify user names are displayed correctly.',
        communityId: '68f8ee2637b5ee4d903d9211', // Use the community ID from the request
        tags: ['test', 'debug']
      };

      const userId = this.resolveRequestUserId(req);
      if (!userId) throw new UnauthorizedException();
      const post = await this.postService.create(samplePostData, userId);
      return { success: true, data: post };
    } catch (error: any) {
      this.logError('Error creating sample post', error);
      return { success: false, data: { error: error.message } };
    }
  }

  @Get('debug/inspect/:communityId')
  @ApiOperation({ summary: 'Inspecter les posts et utilisateurs (debug)' })
  @ApiResponse({ status: 200, description: 'Informations de debug' })
  async inspectCommunityPosts(@Param('communityId') communityId: string): Promise<{ success: boolean; data: any }> {
    this.assertDebugEndpointsEnabled();
    try {
      this.logDebug('Inspecting community posts', { communityId });

      // Step 1: Check basic counts
      const totalPosts = await this.postService['postModel'].countDocuments({});
      const communityPosts = await this.postService['postModel'].countDocuments({ communityId });
      const totalUsers = await this.postService['userModel'].countDocuments({});

      this.logDebug('Basic counts', { totalPosts, communityPosts, totalUsers });

      // Step 2: Get raw posts without population
      const rawPosts = await this.postService['postModel']
        .find({ communityId })
        .limit(3)
        .exec();

      this.logDebug('Raw posts', rawPosts.map(p => ({
        id: p.id,
        title: p.title,
        authorId: p.authorId,
        authorIdType: typeof p.authorId,
        authorIdString: p.authorId.toString()
      })));

      // Step 3: Get posts with population
      const populatedPosts = await this.postService['postModel']
        .find({ communityId })
        .populate('authorId', 'name email profile_picture')
        .limit(3)
        .exec();

      this.logDebug('Populated posts', populatedPosts.map(p => ({
        id: p.id,
        title: p.title,
        authorId: p.authorId,
        authorType: typeof p.authorId,
        authorName: (p.authorId as any)?.name,
        authorEmail: (p.authorId as any)?.email,
        isPopulated: typeof p.authorId === 'object' && (p.authorId as any).name
      })));

      // Step 4: Get sample users
      const users = await this.postService['userModel']
        .find({})
        .select('name email _id')
        .limit(5)
        .exec();

      this.logDebug('Sample users', users.map(u => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email
      })));

      // Step 5: Manual lookup test
      const manualLookupResults: any[] = [];
      for (const post of rawPosts.slice(0, 2)) {
        try {
          const user = await this.postService['userModel']
            .findById(post.authorId)
            .select('name email profile_picture')
            .exec();
          
          manualLookupResults.push({
            postId: post.id,
            authorId: (post.authorId as any).toString(),
            userFound: !!user,
            userName: user?.name,
            userEmail: user?.email
          });
        } catch (error: any) {
          manualLookupResults.push({
            postId: post.id,
            authorId: (post.authorId as any).toString(),
            error: error.message
          });
        }
      }

      this.logDebug('Manual lookup results', manualLookupResults);

      const debugInfo = {
        step1_counts: { totalPosts, communityPosts, totalUsers },
        step2_rawPosts: rawPosts.map(p => ({
          id: p.id,
          title: p.title,
          authorId: p.authorId.toString(),
          createdAt: p.createdAt
        })),
        step3_populatedPosts: populatedPosts.map(p => ({
          id: p.id,
          title: p.title,
          authorId: typeof p.authorId === 'object' ? (p.authorId as any)._id?.toString() : (p.authorId as any)?.toString() || 'unknown',
          authorName: (p.authorId as any)?.name || 'NOT_POPULATED',
          isPopulated: typeof p.authorId === 'object'
        })),
        step4_sampleUsers: users.map(u => ({
          id: u._id.toString(),
          name: u.name,
          email: u.email
        })),
        step5_manualLookup: manualLookupResults,
        diagnosis: this.diagnoseIssue(totalPosts, totalUsers, populatedPosts, users)
      };

      this.logDebug('Complete debug info', debugInfo);
      return { success: true, data: debugInfo };
    } catch (error: any) {
      this.logError('Error inspecting posts', error);
      return { success: false, data: { error: error.message } };
    }
  }

  private diagnoseIssue(totalPosts: number, totalUsers: number, populatedPosts: any[], users: any[]): string {
    if (totalPosts === 0) {
      return 'NO_POSTS: No posts exist in database. Create test posts first.';
    }
    if (totalUsers === 0) {
      return 'NO_USERS: No users exist in database. User registration issue.';
    }
    if (populatedPosts.length > 0 && !populatedPosts[0].isPopulated) {
      return 'POPULATE_FAILED: Posts exist but population is not working. Check User model reference.';
    }
    if (populatedPosts.length > 0 && populatedPosts[0].isPopulated && !populatedPosts[0].authorName) {
      return 'USER_NO_NAME: Users exist and populate works but users have no name field.';
    }
    if (populatedPosts.length > 0 && populatedPosts[0].authorName) {
      return 'SUCCESS: Everything should work. Check frontend transformation logic.';
    }
    return 'UNKNOWN: Further investigation needed.';
  }

  @Get('debug/test-flow/:communityId')
  @ApiOperation({ summary: 'Test le flux complet de transformation (debug)' })
  @ApiResponse({ status: 200, description: 'Test du flux' })
  async testCompleteFlow(@Param('communityId') communityId: string): Promise<{ success: boolean; data: any }> {
    this.assertDebugEndpointsEnabled();
    try {
      this.logDebug('Testing complete flow for community', { communityId });

      // Use the actual service method that the frontend calls
      const result = await this.postService.findByCommunity(communityId, 1, 5);

      this.logDebug('Service returned', {
        postsCount: result.posts.length,
        samplePost: result.posts[0] ? {
          id: result.posts[0].id,
          title: result.posts[0].title,
          authorName: result.posts[0].author.name,
          authorId: result.posts[0].author.id
        } : null
      });

      return { success: true, data: { serviceResult: result } };
    } catch (error: any) {
      this.logError('Error testing flow', error);
      return { success: false, data: { error: error.message } };
    }
  }

  @Get(':id/stats')
  @ApiOperation({ summary: "Récupérer les statistiques d'un post" })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: "ID de l'utilisateur pour vérifier s'il a liké",
  })
  @ApiResponse({ status: 200, description: 'Statistiques récupérées avec succès', type: PostStatsResponseDto })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async getPostStats(
    @Param('id') postId: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean; data: PostStatsResponseDto }> {
    const effectiveUserId = this.resolveRequestUserId(req, userId);
    const stats = await this.postService.getPostStats(postId, effectiveUserId);
    return { success: true, data: stats };
  }
}

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
import {
  PostResponseDto,
  PostListResponseDto,
  PostCommentResponseDto,
  PostStatsResponseDto,
} from '../dto-post/post-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Posts')
@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

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
    const userId = req.user._id || req.user.userId;
    console.log('📝 [POST-CONTROLLER] Create post request received:', {
      body: createPostDto,
      userId,
      user: req.user
    });
    
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
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    const tagsArray = tags ? tags.split(',') : undefined;
    const posts = await this.postService.findAll(
      page || 1,
      limit || 10,
      communityId,
      authorId,
      tagsArray,
      search,
    );
    return { success: true, data: posts };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Récupérer les posts d'un utilisateur" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: "Posts de l'utilisateur récupérés avec succès",
    type: PostListResponseDto,
  })
  async findByUser(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    const posts = await this.postService.findByUser(
      userId,
      page || 1,
      limit || 10,
    );
    return { success: true, data: posts };
  }

  @Get('community/:communityId')
  @ApiOperation({ summary: "Récupérer les posts d'une communauté" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Posts de la communauté récupérés avec succès',
    type: PostListResponseDto,
  })
  async findByCommunity(
    @Param('communityId') communityId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<{ success: boolean; data: PostListResponseDto }> {
    console.log('📝 [POST-CONTROLLER] Find posts by community request:', {
      communityId,
      page: page || 1,
      limit: limit || 10
    });
    
    try {
      // Validate input parameters
      if (!communityId || communityId.trim() === '') {
        throw new Error('Community ID is required');
      }

      const posts = await this.postService.findByCommunity(
        communityId.trim(),
        page || 1,
        limit || 10,
      );
      console.log('✅ [POST-CONTROLLER] Successfully found posts:', posts.posts.length);
      return { success: true, data: posts };
    } catch (error: any) {
      console.error('❌ [POST-CONTROLLER] Error in findByCommunity:', {
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
    const post = await this.postService.update(
      id,
      updatePostDto,
      req.user.userId,
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
    const result = await this.postService.remove(id, req.user.userId);
    return { success: true, message: result.message };
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
    const comment = await this.postService.addComment(
      postId,
      createCommentDto,
      req.user.userId,
    );
    return { success: true, data: comment };
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
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
    const result = await this.postService.removeComment(
      postId,
      commentId,
      req.user.userId,
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
    const comment = await this.postService.updateComment(
      postId,
      commentId,
      content,
      req.user.userId,
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
    await this.postService.bookmarkPost(id, req.user.userId);
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
    await this.postService.unbookmarkPost(id, req.user.userId);
    return { success: true, message: 'Post retiré des favoris' };
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
    const bookmarks = await this.postService.getUserBookmarks(
      req.user.userId,
      page || 1,
      limit || 20,
    );
    return { success: true, data: bookmarks };
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
    const stats = await this.postService.likePost(postId, req.user.userId);
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
    const stats = await this.postService.unlikePost(postId, req.user.userId);
    return { success: true, data: stats };
  }

  @Get('debug/count')
  @ApiOperation({ summary: 'Compter tous les posts (debug)' })
  @ApiResponse({ status: 200, description: 'Nombre de posts' })
  async getPostsCount(): Promise<{ success: boolean; data: { total: number } }> {
    try {
      const total = await this.postService.countAllPosts();
      return { success: true, data: { total } };
    } catch (error) {
      console.error('❌ [POST-CONTROLLER] Error counting posts:', error);
      throw error;
    }
  }

  @Post('debug/create-sample')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Créer un post de test (debug)' })
  @ApiResponse({ status: 201, description: 'Post de test créé' })
  async createSamplePost(@Request() req): Promise<{ success: boolean; data: any }> {
    try {
      console.log('🧪 [POST-CONTROLLER] Creating sample post for user:', req.user);
      
      // Create a sample post using the authenticated user
      const samplePostData = {
        title: 'Test Post',
        content: 'This is a test post to verify user names are displayed correctly.',
        communityId: '68f8ee2637b5ee4d903d9211', // Use the community ID from the request
        tags: ['test', 'debug']
      };

      const post = await this.postService.create(samplePostData, req.user.userId || req.user.sub);
      return { success: true, data: post };
    } catch (error: any) {
      console.error('❌ [POST-CONTROLLER] Error creating sample post:', error);
      return { success: false, data: { error: error.message } };
    }
  }

  @Get('debug/inspect/:communityId')
  @ApiOperation({ summary: 'Inspecter les posts et utilisateurs (debug)' })
  @ApiResponse({ status: 200, description: 'Informations de debug' })
  async inspectCommunityPosts(@Param('communityId') communityId: string): Promise<{ success: boolean; data: any }> {
    try {
      console.log('🔍 [POST-CONTROLLER] Inspecting community posts:', communityId);
      
      // Step 1: Check basic counts
      const totalPosts = await this.postService['postModel'].countDocuments({});
      const communityPosts = await this.postService['postModel'].countDocuments({ communityId });
      const totalUsers = await this.postService['userModel'].countDocuments({});
      
      console.log('📊 Basic counts:', { totalPosts, communityPosts, totalUsers });

      // Step 2: Get raw posts without population
      const rawPosts = await this.postService['postModel']
        .find({ communityId })
        .limit(3)
        .exec();

      console.log('📋 Raw posts:', rawPosts.map(p => ({
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

      console.log('👥 Populated posts:', populatedPosts.map(p => ({
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

      console.log('👤 Sample users:', users.map(u => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email
      })));

      // Step 5: Manual lookup test
      let manualLookupResults: any[] = [];
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

      console.log('🔍 Manual lookup results:', manualLookupResults);

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

      console.log('🎯 [POST-CONTROLLER] Complete debug info:', debugInfo);
      return { success: true, data: debugInfo };
    } catch (error: any) {
      console.error('❌ [POST-CONTROLLER] Error inspecting posts:', error);
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
    try {
      console.log('🧪 [POST-CONTROLLER] Testing complete flow for community:', communityId);
      
      // Use the actual service method that the frontend calls
      const result = await this.postService.findByCommunity(communityId, 1, 5);
      
      console.log('🎯 [POST-CONTROLLER] Service returned:', {
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
      console.error('❌ [POST-CONTROLLER] Error testing flow:', error);
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
  @ApiResponse({
    status: 200,
    description: 'Statistiques récupérées avec succès',
    type: PostStatsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post non trouvé' })
  async getPostStats(
    @Param('id') postId: string,
    @Query('userId') userId?: string,
  ): Promise<{ success: boolean; data: PostStatsResponseDto }> {
    const stats = await this.postService.getPostStats(postId, userId);
    return { success: true, data: stats };
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from '../schema/post.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreatePostDto } from '../dto-post/create-post.dto';
import { UpdatePostDto } from '../dto-post/update-post.dto';
import { CreatePostCommentDto } from '../dto-post/create-post.dto';
import {
  PostResponseDto,
  PostListResponseDto,
  PostCommentResponseDto,
  PostStatsResponseDto,
} from '../dto-post/post-response.dto';

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) { }

  /**
   * Créer un nouveau post
   */
  async create(
    createPostDto: CreatePostDto,
    userId: string,
  ): Promise<PostResponseDto> {
    console.log('🎯 [POST-SERVICE] Creating post with data:', {
      communityId: createPostDto.communityId,
      userId,
      title: createPostDto.title
    });

    // Check if the user exists
    const userExists = await this.userModel.findById(userId).select('name email');
    console.log('👤 [POST-SERVICE] User creating post:', {
      userId,
      userExists: !!userExists,
      userName: userExists?.name,
      userEmail: userExists?.email
    });

    // Vérifier que la communauté existe
    const community = await this.communityModel.findById(createPostDto.communityId);
    console.log('🏘️ [POST-SERVICE] Community found:', community ? community.name : 'NONE');

    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    // Vérifier que l'utilisateur est membre de la communauté ou est le créateur
    const normalizedUserId = typeof userId === 'object' ? (userId as any).toString() : String(userId);
    const isMember = community.members.some(
      (member) => member.toString() === normalizedUserId,
    );
    const isCreator = community.createur.toString() === normalizedUserId;

    if (!isMember && !isCreator) {
      throw new ForbiddenException(
        'Vous devez être membre de cette communauté pour publier un post',
      );
    }

    // Créer le post
    // Normalize userId to ObjectId if it's a string
    const authorObjectId = typeof userId === 'string'
      ? new Types.ObjectId(userId)
      : userId;

    const post = new this.postModel({
      id: new Types.ObjectId().toString(), // Generate unique ID for posts
      title: createPostDto.title,
      content: createPostDto.content,
      excerpt: createPostDto.excerpt,
      thumbnail: createPostDto.thumbnail,
      communityId: createPostDto.communityId,
      authorId: authorObjectId,
      isPublished: true, // Toujours publié directement
      likes: 0,
      shareCount: 0,
      comments: [],
      likedBy: [],
      sharedBy: [],
      tags: createPostDto.tags || [],
      images: createPostDto.images || [],
      videos: createPostDto.videos || [],
      links: createPostDto.links || [],
    });

    const savedPost = await post.save();
    console.log(' [POST-SERVICE] Post saved with ID:', savedPost._id);

    // Récupérer les informations complètes avec populated author
    const populatedPost = await this.postModel
      .findById(savedPost._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    console.log(' [POST-SERVICE] Post created with author data:', {
      postId: populatedPost!.id,
      authorId: populatedPost!.authorId,
      authorName: (populatedPost!.authorId as any)?.name,
      authorEmail: (populatedPost!.authorId as any)?.email
    });

    return await this.transformToResponseDto(populatedPost!, community);
  }

  /**
   * Récupérer tous les posts avec pagination et filtres
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    communityId?: string,
    authorId?: string,
    tags?: string[],
    search?: string,
    userId?: string,
  ): Promise<PostListResponseDto> {
    console.log('🔍 [POST-SERVICE] FindAll called with:', { page, limit, communityId, authorId, tags, search });

    const query: any = { isPublished: true };

    // Filtres
    if (communityId) {
      query.communityId = communityId;
      console.log('🏘️ [POST-SERVICE] Filtering by community:', communityId);
    }
    if (authorId) {
      query.authorId = new Types.ObjectId(authorId);
    }
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    console.log('📋 [POST-SERVICE] Final query:', JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .select('+likedBy') // Explicitly select likedBy array
        .populate('authorId', 'name email profile_picture photo_profil')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments(query),
    ]);

    console.log('📝 [POST-SERVICE] Posts fetched with population:', posts.map(p => ({
      id: p.id,
      authorId: p.authorId,
      authorName: (p.authorId as any)?.name || 'NOT_POPULATED',
      likes: p.likes,
      likedByCount: p.likedBy?.length || 0,
      likedByIds: p.likedBy?.map((id: Types.ObjectId) => id.toString()) || []
    })));
    
    console.log('👤 [POST-SERVICE] Current userId for like check:', userId);

    console.log('📊 [POST-SERVICE] Query results:', {
      postsFound: posts.length,
      totalCount: total,
      skip,
      limit
    });

    // Récupérer les informations des communautés
    const communityIds = [...new Set(posts.map((post) => post.communityId))];
    console.log('🔍 [POST-SERVICE] Looking up communities for IDs:', communityIds);

    let communities: CommunityDocument[] = [];
    try {
      communities = await this.communityModel.find({
        _id: {
          $in: communityIds.map(id => {
            try {
              return new Types.ObjectId(id);
            } catch (error) {
              console.warn('⚠️ [POST-SERVICE] Invalid ObjectId format:', id);
              return null;
            }
          }).filter(Boolean)
        },
      });
      console.log('✅ [POST-SERVICE] Found communities:', communities.length);
    } catch (error) {
      console.error('❌ [POST-SERVICE] Error fetching communities:', error);
      communities = [];
    }

    const postsWithCommunities = await Promise.all(
      posts.map(async (post) => {
        try {
          const community = communities.find((c) => c._id.toString() === post.communityId);
          return await this.transformToResponseDto(post, community, userId);
        } catch (error) {
          console.error('❌ [POST-SERVICE] Error transforming post:', post.id, error);
          // Return a basic post structure if transformation fails
          return {
            id: post.id,
            title: post.title || 'Untitled',
            content: post.content,
            excerpt: post.excerpt,
            thumbnail: post.thumbnail,
            communityId: post.communityId,
            community: {
              id: post.communityId,
              name: 'Unknown Community',
              slug: 'unknown',
            },
            authorId: post.authorId.toString(),
            author: {
              id: post.authorId.toString(),
              name: 'Unknown Author',
              email: '',
              profile_picture: '',
            },
            isPublished: post.isPublished,
            likes: post.likes || 0,
            shareCount: post.shareCount || 0,
            isLikedByUser: false,
            isSharedByUser: false,
            comments: [],
            tags: post.tags || [],
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
          };
        }
      }),
    );

    return {
      posts: postsWithCommunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Récupérer un post par son ID
   */
  async findOne(id: string): Promise<PostResponseDto> {
    const post = await this.postModel
      .findOne({ id })
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const community = await this.communityModel.findById(post.communityId);
    return await this.transformToResponseDto(post, community || undefined);
  }

  /**
   * Mettre à jour un post
   */
  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    userId: string,
  ): Promise<PostResponseDto> {
    const post = await this.postModel.findOne({ id });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Vérifier que l'utilisateur est l'auteur du post
    // Normalize both IDs to strings for comparison
    const postAuthorId = post.authorId?.toString() || '';
    const normalizedUserId = userId?.toString() || '';
    
    console.log('🔐 [POST-SERVICE] Authorization check for update:', {
      postId: id,
      postAuthorId,
      normalizedUserId,
      match: postAuthorId === normalizedUserId
    });
    
    if (postAuthorId !== normalizedUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres posts',
      );
    }

    // Mettre à jour le post
    Object.assign(post, updatePostDto);
    post.updatedAt = new Date();

    const updatedPost = await post.save();

    // Récupérer les informations complètes
    const populatedPost = await this.postModel
      .findById(updatedPost._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    const community = await this.communityModel.findById(post.communityId);
    return await this.transformToResponseDto(
      populatedPost!,
      community || undefined,
    );
  }

  /**
   * Supprimer un post
   */
  async remove(id: string, userId: string): Promise<{ message: string }> {
    const post = await this.postModel.findOne({ id });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Vérifier que l'utilisateur est l'auteur du post
    // Normalize both IDs to strings for comparison
    const postAuthorId = post.authorId?.toString() || '';
    const normalizedUserId = userId?.toString() || '';
    
    console.log('🔐 [POST-SERVICE] Authorization check for delete:', {
      postId: id,
      postAuthorId,
      normalizedUserId,
      match: postAuthorId === normalizedUserId
    });
    
    if (postAuthorId !== normalizedUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres posts',
      );
    }

    await this.postModel.deleteOne({ _id: post._id });
    return { message: 'Post supprimé avec succès' };
  }

  /**
   * Récupérer tous les commentaires d'un post
   */
  async getComments(
    postId: string,
    userId?: string,
  ): Promise<PostCommentResponseDto[]> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Transformer les commentaires avec les informations des utilisateurs
    const comments = await Promise.all(
      post.comments.map(async (comment) => {
        const user = await this.userModel
          .findById(comment.userId)
          .select('name profile_picture photo_profil');

        return {
          id: comment.id,
          content: comment.content,
          userId: comment.userId.toString(),
          userName: user?.name || 'Utilisateur inconnu',
          userAvatar: user?.photo_profil || user?.profile_picture,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        };
      }),
    );

    return comments;
  }

  /**
   * Ajouter un commentaire à un post
   */
  async addComment(
    postId: string,
    createCommentDto: CreatePostCommentDto,
    userId: string,
  ): Promise<PostCommentResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Vérifier que l'utilisateur est membre de la communauté
    const community = await this.communityModel.findById(post.communityId);
    if (!community) {
      throw new NotFoundException('Communauté non trouvée');
    }

    // Vérifier que l'utilisateur est membre de la communauté ou est le créateur
    const normalizedUserId = typeof userId === 'object' ? (userId as any).toString() : String(userId);
    const isMember = community.members.some(
      (member) => member.toString() === normalizedUserId,
    );
    const isCreator = community.createur.toString() === normalizedUserId;

    if (!isMember && !isCreator) {
      throw new ForbiddenException(
        'Vous devez être membre de cette communauté pour commenter',
      );
    }

    // Créer le commentaire
    const comment = {
      id: new Types.ObjectId().toString(),
      content: createCommentDto.content,
      userId: new Types.ObjectId(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    post.addComment(comment);
    await post.save();

    // Récupérer les informations de l'utilisateur
    const user = await this.userModel
      .findById(userId)
      .select('name profile_picture');

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.userId.toString(),
      userName: user?.name || 'Utilisateur inconnu',
      userAvatar: user?.profile_picture,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  /**
   * Supprimer un commentaire
   */
  async removeComment(
    postId: string,
    commentId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) {
      throw new NotFoundException('Commentaire non trouvé');
    }

    // Vérifier que l'utilisateur est l'auteur du commentaire ou l'auteur du post
    // Normalize IDs to strings for comparison
    const commentAuthorId = comment.userId?.toString() || '';
    const postAuthorId = post.authorId?.toString() || '';
    const normalizedUserId = userId?.toString() || '';
    
    console.log('🔐 [POST-SERVICE] Authorization check for comment delete:', {
      commentId,
      commentAuthorId,
      postAuthorId,
      normalizedUserId,
      isCommentAuthor: commentAuthorId === normalizedUserId,
      isPostAuthor: postAuthorId === normalizedUserId
    });
    
    const isCommentAuthor = commentAuthorId === normalizedUserId;
    const isPostAuthor = postAuthorId === normalizedUserId;

    if (!isCommentAuthor && !isPostAuthor) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres commentaires',
      );
    }

    post.removeComment(commentId);
    await post.save();

    return { message: 'Commentaire supprimé avec succès' };
  }

  /**
   * Mettre à jour un commentaire
   */
  async updateComment(
    postId: string,
    commentId: string,
    content: string,
    userId: string,
  ): Promise<PostCommentResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) {
      throw new NotFoundException('Commentaire non trouvé');
    }

    // Vérifier que l'utilisateur est l'auteur du commentaire
    // Normalize IDs to strings for comparison
    const commentAuthorId = comment.userId?.toString() || '';
    const normalizedUserId = userId?.toString() || '';
    
    console.log('🔐 [POST-SERVICE] Authorization check for comment update:', {
      commentId,
      commentAuthorId,
      normalizedUserId,
      match: commentAuthorId === normalizedUserId
    });
    
    if (commentAuthorId !== normalizedUserId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres commentaires',
      );
    }

    post.updateComment(commentId, content);
    await post.save();

    // Récupérer les informations de l'utilisateur
    const user = await this.userModel
      .findById(userId)
      .select('name profile_picture');

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.userId.toString(),
      userName: user?.name || 'Utilisateur inconnu',
      userAvatar: user?.profile_picture,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  /**
   * Liker un post
   */
  async likePost(
    postId: string,
    userId: string,
  ): Promise<PostStatsResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userIdObj = new Types.ObjectId(userId);
    console.log('👍 [POST-SERVICE] Attempting to like post:', {
      postId: post.id,
      userId: userId,
      userIdObj: userIdObj.toString(),
      currentLikedBy: post.likedBy.map((id: Types.ObjectId) => id.toString()),
      currentLikes: post.likes
    });
    
    const wasLiked = post.likePost(userIdObj);

    if (!wasLiked) {
      console.log('ℹ️ [POST-SERVICE] User already liked this post');
      // Already liked - return current state without error
      return {
        postId: post.id,
        totalLikes: post.likes,
        totalComments: post.getCommentsCount(),
        totalShares: post.shareCount || 0,
        isLikedByUser: true,
        isSharedByUser: post.isSharedBy(userIdObj),
      };
    }

    console.log('✅ [POST-SERVICE] Like added, saving...', {
      newLikedBy: post.likedBy.map((id: Types.ObjectId) => id.toString()),
      newLikes: post.likes
    });
    
    await post.save();

    console.log('💾 [POST-SERVICE] Post saved successfully');

    return {
      postId: post.id,
      totalLikes: post.likes,
      totalComments: post.getCommentsCount(),
      totalShares: post.shareCount || 0,
      isLikedByUser: true,
      isSharedByUser: post.isSharedBy(userIdObj),
    };
  }

  /**
   * Unliker un post
   */
  async unlikePost(
    postId: string,
    userId: string,
  ): Promise<PostStatsResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userIdObj = new Types.ObjectId(userId);
    const wasUnliked = post.unlikePost(userIdObj);

    if (!wasUnliked) {
      // Already unliked - return current state without error
      return {
        postId: post.id,
        totalLikes: post.likes,
        totalComments: post.getCommentsCount(),
        totalShares: post.shareCount || 0,
        isLikedByUser: false,
        isSharedByUser: post.isSharedBy(userIdObj),
      };
    }

    await post.save();

    return {
      postId: post.id,
      totalLikes: post.likes,
      totalComments: post.getCommentsCount(),
      totalShares: post.shareCount || 0,
      isLikedByUser: false,
      isSharedByUser: post.isSharedBy(userIdObj),
    };
  }

  /**
   * Partager un post (compte unique par utilisateur)
   */
  async sharePost(
    postId: string,
    userId: string,
  ): Promise<PostStatsResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userObjectId = new Types.ObjectId(userId);
    const shared = post.sharePost(userObjectId);

    // Save even if already shared? only save when new share to avoid extra writes.
    if (shared) {
      await post.save();
    }

    return {
      postId: post.id,
      totalLikes: post.likes,
      totalComments: post.getCommentsCount(),
      totalShares: post.shareCount || 0,
      isLikedByUser: post.isLikedBy(userObjectId),
      isSharedByUser: true,
    };
  }

  /**
   * Récupérer les statistiques d'un post
   */
  async getPostStats(postId: string, userId?: string): Promise<PostStatsResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userObjectId = userId ? new Types.ObjectId(userId) : null;

    return {
      postId: post.id,
      totalLikes: post.likes,
      totalComments: post.getCommentsCount(),
      totalShares: post.shareCount || 0,
      isLikedByUser: userObjectId ? post.isLikedBy(userObjectId) : false,
      isSharedByUser: userObjectId ? post.isSharedBy(userObjectId) : false,
    };
  }

  /**
   * Récupérer les posts d'un utilisateur
   */
  async findByUser(
    authorId: string,
    page: number = 1,
    limit: number = 10,
    currentUserId?: string,
  ): Promise<PostListResponseDto> {
    return this.findAll(page, limit, undefined, authorId, undefined, undefined, currentUserId);
  }

  /**
   * Récupérer les posts d'une communauté
   */
  async findByCommunity(
    communityId: string,
    page: number = 1,
    limit: number = 10,
    userId?: string,
  ): Promise<PostListResponseDto> {
    console.log('🏘️ [POST-SERVICE] Finding posts for community:', communityId);
    console.log('📄 [POST-SERVICE] Pagination:', { page, limit });

    try {
      // First, let's check if any posts exist at all
      const totalPosts = await this.postModel.countDocuments({});
      const communityPosts = await this.postModel.countDocuments({ communityId });

      console.log('📊 [POST-SERVICE] Database stats:', {
        totalPosts,
        communityPosts,
        communityId
      });

      // If no posts exist, return empty result
      if (totalPosts === 0) {
        console.log('ℹ️ [POST-SERVICE] No posts in database, returning empty result');
        return {
          posts: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      const result = await this.findAll(page, limit, communityId, undefined, undefined, undefined, userId);
      console.log('✅ [POST-SERVICE] Found posts:', result.posts.length);
      return result;
    } catch (error) {
      console.error('❌ [POST-SERVICE] Error in findByCommunity:', error);

      // Return empty result instead of throwing
      return {
        posts: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  /**
   * Transformer un document Post en DTO de réponse
   */
  private async transformToResponseDto(
    post: PostDocument,
    community?: CommunityDocument | null,
    userId?: string,
  ): Promise<PostResponseDto> {
    try {
      console.log('🔄 [POST-SERVICE] Transforming post:', post.id);

      // Transformer les commentaires avec error handling
      let comments: any[] = [];
      try {
        comments = await Promise.all(
          post.comments.map(async (comment) => {
            try {
              const user = await this.userModel
                .findById(comment.userId)
                .select('name profile_picture photo_profil');
              return {
                id: comment.id,
                content: comment.content,
                userId: comment.userId.toString(),
                userName: user?.name || 'Utilisateur inconnu',
                userAvatar: user?.photo_profil || user?.profile_picture,
                createdAt: comment.createdAt.toISOString(),
                updatedAt: comment.updatedAt.toISOString(),
              };
            } catch (commentError) {
              console.error('❌ [POST-SERVICE] Error transforming comment:', commentError);
              return {
                id: comment.id,
                content: comment.content,
                userId: comment.userId.toString(),
                userName: 'Utilisateur inconnu',
                userAvatar: null,
                createdAt: comment.createdAt.toISOString(),
                updatedAt: comment.updatedAt.toISOString(),
              };
            }
          }),
        );
      } catch (commentsError) {
        console.error('❌ [POST-SERVICE] Error transforming comments:', commentsError);
        comments = [];
      }

      // Récupérer les informations de l'auteur avec error handling
      let author: any = null;
      try {
        console.log('👤 [POST-SERVICE] Fetching author for post:', post.id);
        console.log('🔍 [POST-SERVICE] Author ID type:', typeof post.authorId);
        console.log('🔍 [POST-SERVICE] Author ID value:', post.authorId);

        // First try to get from populated data if available
        if (post.authorId && typeof post.authorId === 'object' && (post.authorId as any).name) {
          author = post.authorId;
          console.log('✅ [POST-SERVICE] Using populated author data:', author.name);
        } else {
          // Fallback to direct lookup
          console.log('🔍 [POST-SERVICE] Performing direct user lookup for ID:', post.authorId);

          // Try multiple approaches to get user data
          console.log('🔄 [POST-SERVICE] Trying multiple user lookup approaches...');

          // Approach 1: Direct findById
          author = await this.userModel
            .findById(post.authorId)
            .select('name email profile_picture photo_profil')
            .exec();

          console.log('🔍 [POST-SERVICE] Approach 1 (direct lookup) result:', {
            found: !!author,
            name: author?.name,
            email: author?.email,
            profile_picture: author?.profile_picture,
            photo_profil: author?.photo_profil
          });

          // Approach 2: If first approach failed, try without select
          if (!author) {
            console.log('🔄 [POST-SERVICE] Trying without select...');
            const fullUser = await this.userModel.findById(post.authorId).exec();
            if (fullUser) {
              author = {
                name: fullUser.name,
                email: fullUser.email,
                profile_picture: fullUser.profile_picture || fullUser.photo_profil,
                _id: fullUser._id
              };
              console.log('✅ [POST-SERVICE] Approach 2 success:', author);
            } else {
              console.log('❌ [POST-SERVICE] User not found with ID:', post.authorId);
            }
          }

          // Approach 3: Check if authorId is valid ObjectId format
          if (!author) {
            console.log('🔍 [POST-SERVICE] Checking if authorId is valid ObjectId format...');
            try {
              const isValidObjectId = Types.ObjectId.isValid(post.authorId);
              console.log('🔍 [POST-SERVICE] Is valid ObjectId:', isValidObjectId);

              if (isValidObjectId) {
                // Try to find any user to see if the model works
                const anyUser = await this.userModel.findOne().select('name email _id').exec();
                console.log('🔍 [POST-SERVICE] Can find any user?', !!anyUser);
                if (anyUser) {
                  console.log('📝 [POST-SERVICE] Sample user found:', {
                    _id: anyUser._id,
                    name: anyUser.name,
                    email: anyUser.email
                  });
                }
              }
            } catch (objectIdError) {
              console.error('❌ [POST-SERVICE] ObjectId validation error:', objectIdError);
            }
          }
        }
      } catch (authorError) {
        console.error('❌ [POST-SERVICE] Error fetching author:', authorError);
      }

      // Get author name with multiple fallbacks
      let authorName = 'Auteur inconnu';
      if (author?.name) {
        authorName = author.name;
      } else if (typeof post.authorId === 'object' && (post.authorId as any).name) {
        authorName = (post.authorId as any).name;
      }

      // Determine author role based on community relationship
      let authorRole = 'member';
      const authorIdForRole = typeof post.authorId === 'object'
        ? (post.authorId as any)._id?.toString() || (post.authorId as any).toString()
        : String(post.authorId);

      if (community) {
        const communityCreatorId = community.createur?.toString();
        if (communityCreatorId === authorIdForRole) {
          authorRole = 'creator';
        } else if (community.admins?.some((admin: any) => admin.toString() === authorIdForRole)) {
          authorRole = 'admin';
        } else if (community.members?.some((member: any) => member.toString() === authorIdForRole)) {
          authorRole = 'member';
        }
      }

      console.log('👤 [POST-SERVICE] Final author name for post:', post.id, '->', authorName, 'Role:', authorRole);

      // Helper function to safely get author ID as string
      const getAuthorIdString = (): string => {
        try {
          if (typeof post.authorId === 'object' && post.authorId) {
            const authorObj = post.authorId as any;
            return authorObj._id?.toString() || authorObj.toString() || 'unknown';
          }
          return (post.authorId as any)?.toString() || 'unknown';
        } catch (error) {
          console.warn('⚠️ [POST-SERVICE] Error converting authorId to string:', error);
          return 'unknown';
        }
      };

      const authorIdString = getAuthorIdString();

      // Calculate isLikedByUser based on userId
      let isLikedByUser = false;
      if (userId) {
        try {
          const userObjectId = new Types.ObjectId(userId);
          console.log('🔍 [POST-SERVICE] Checking if user liked post:', {
            postId: post.id,
            userId: userId,
            userObjectId: userObjectId.toString(),
            likedByArray: post.likedBy.map((id: Types.ObjectId) => id.toString()),
            likedByCount: post.likedBy.length
          });
          isLikedByUser = post.isLikedBy(userObjectId);
          console.log('✅ [POST-SERVICE] isLikedBy result:', isLikedByUser);
        } catch (error) {
          console.warn('⚠️ [POST-SERVICE] Invalid userId for like check:', userId);
        }
      }

      const result = {
        id: post.id,
        title: post.title || '',
        content: post.content || '',
        excerpt: post.excerpt || '',
        thumbnail: post.thumbnail || '',
        communityId: post.communityId,
        community: community
          ? {
            id: community._id.toString(),
            name: community.name,
            slug: community.slug,
          }
          : {
            id: post.communityId,
            name: 'Communauté inconnue',
            slug: 'unknown',
          },
        authorId: authorIdString,
        author: {
          id: authorIdString,
          name: authorName,
          email: author?.email || '',
          username: authorName, // Adding username field for frontend
          firstName: authorName, // Adding firstName field for frontend
          avatar: author?.photo_profil || author?.profile_picture || '',
          role: authorRole,
        },
        isPublished: post.isPublished,
        likes: post.likes || 0,
        isLikedByUser,
        shareCount: post.shareCount || 0,
        isSharedByUser: userId ? post.isSharedBy(new Types.ObjectId(userId)) : false,
        comments,
        tags: post.tags || [],
        images: post.images || [],
        videos: post.videos || [],
        links: post.links || [],
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      };

      console.log('✅ [POST-SERVICE] Successfully transformed post:', post.id);
      return result;
    } catch (error) {
      console.error('❌ [POST-SERVICE] Critical error in transformToResponseDto:', error);
      console.error('Post data:', {
        id: post.id,
        authorId: post.authorId,
        communityId: post.communityId,
        title: post.title
      });

      // Return a minimal safe version
      return {
        id: post.id || 'unknown',
        title: post.title || 'Untitled',
        content: post.content || '',
        excerpt: post.excerpt || '',
        thumbnail: post.thumbnail || '',
        communityId: post.communityId || 'unknown',
        community: {
          id: post.communityId || 'unknown',
          name: 'Communauté inconnue',
          slug: 'unknown',
        },
        authorId: (post.authorId as any)?.toString() || 'unknown',
        author: {
          id: (post.authorId as any)?.toString() || 'unknown',
          name: 'Auteur inconnu',
          email: '',
          profile_picture: '',
        },
        isPublished: post.isPublished || false,
        likes: post.likes || 0,
        shareCount: post.shareCount || 0,
        isLikedByUser: false,
        isSharedByUser: false,
        comments: [],
        tags: post.tags || [],
        images: post.images || [],
        videos: post.videos || [],
        links: post.links || [],
        createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: post.updatedAt?.toISOString() || new Date().toISOString(),
      };
    }
  }

  /**
   * Ajouter un post aux favoris
   */
  async bookmarkPost(postId: string, userId: string): Promise<void> {
    // Use findOne({ id }) instead of findById() because Post schema has custom 'id' field
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Vérifier si le post n'est pas déjà dans les favoris
    const userObjectId = new Types.ObjectId(userId);
    if (!post.bookmarks.some((bookmark) => bookmark.equals(userObjectId))) {
      post.bookmarks.push(userObjectId);
      await post.save();
    }
  }

  /**
   * Retirer un post des favoris
   */
  async unbookmarkPost(postId: string, userId: string): Promise<void> {
    // Use findOne({ id }) instead of findById() because Post schema has custom 'id' field
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    // Retirer l'utilisateur des favoris
    const userObjectId = new Types.ObjectId(userId);
    post.bookmarks = post.bookmarks.filter(
      (bookmark) => !bookmark.equals(userObjectId),
    );
    await post.save();
  }

  /**
   * Compter tous les posts (pour debug)
   */
  async countAllPosts(): Promise<number> {
    try {
      const count = await this.postModel.countDocuments({});
      console.log('📊 [POST-SERVICE] Total posts in database:', count);
      return count;
    } catch (error) {
      console.error('❌ [POST-SERVICE] Error counting posts:', error);
      return 0;
    }
  }

  /**
   * Récupérer les posts mis en favoris par l'utilisateur
   */
  async getUserBookmarks(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PostListResponseDto> {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    // Récupérer les posts où l'utilisateur est dans les bookmarks
    const posts = await this.postModel
      .find({
        bookmarks: userObjectId,
        isPublished: true,
      })
      .populate('communityId', 'name slug')
      .populate('authorId', 'name email profile_picture photo_profil')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    // Compter le total
    const total = await this.postModel.countDocuments({
      bookmarks: userObjectId,
      isPublished: true,
    });

    // Transformer les posts
    const transformedPosts = await Promise.all(
      posts.map(async (post) => {
        // Vérifier si l'utilisateur a liké ce post
        const isLikedByUser = post.likedBy.includes(userObjectId);

        // Cast des types pour les champs populés
        const community = post.communityId as any;
        const author = post.authorId as any;

        return {
          id: post.id,
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          thumbnail: post.thumbnail,
          communityId: community._id?.toString() || community.toString(),
          community: {
            id: community._id?.toString() || community.toString(),
            name: community.name || 'Communauté inconnue',
            slug: community.slug || 'unknown',
          },
          authorId: author._id?.toString() || author.toString(),
          author: {
            id: author._id?.toString() || author.toString(),
            name: author.name || 'Auteur inconnu',
            email: author.email || '',
            profile_picture: author.profile_picture || author.photo_profil || '',
            photo_profil: author.photo_profil || author.profile_picture || '',
            role: author.role || '',
          },
          isPublished: post.isPublished,
          likes: post.likedBy.length,
          isLikedByUser,
          shareCount: post.shareCount || 0,
          isSharedByUser: post.isSharedBy(userObjectId),
          comments: [], // Empty for list view - will be populated in detailed view
          tags: post.tags,
          images: post.images || [],
          videos: post.videos || [],
          links: post.links || [],
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        };
      }),
    );

    return {
      posts: transformedPosts,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

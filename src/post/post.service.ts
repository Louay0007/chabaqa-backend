import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from '../schema/post.schema';
import { Community, CommunityDocument } from '../schema/community.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CreatePostDto } from '../dto-post/create-post.dto';
import { UpdatePostDto } from '../dto-post/update-post.dto';
import { CreatePostCommentDto } from '../dto-post/create-post.dto';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { TrackableContentType, TrackingActionType } from '../schema/content-tracking.schema';
import {
  PostResponseDto,
  PostListResponseDto,
  PostCommentResponseDto,
  PostReactionResponseDto,
  PostStatsResponseDto,
  PostShareMetaResponseDto,
} from '../dto-post/post-response.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  private readonly isDebugLoggingEnabled = process.env.NODE_ENV !== 'production';

  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Community.name)
    private communityModel: Model<CommunityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly contentTrackingService: ContentTrackingService,
    private readonly notificationService: NotificationService,
  ) { }

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

  private logWarn(...args: unknown[]): void {
    this.logger.warn(args.map((arg) => this.serializeLogArg(arg)).join(' '));
  }

  private logError(...args: unknown[]): void {
    this.logger.error(args.map((arg) => this.serializeLogArg(arg)).join(' '));
  }

  private async resolvePostByIdentifier(postIdentifier: string): Promise<PostDocument | null> {
    const normalized = String(postIdentifier || '').trim();
    if (!normalized) {
      return null;
    }

    const byCustomId = await this.postModel.findOne({ id: normalized });
    if (byCustomId) {
      return byCustomId;
    }

    if (Types.ObjectId.isValid(normalized)) {
      return this.postModel.findById(new Types.ObjectId(normalized)).exec();
    }

    return null;
  }

  private buildShareText(post: PostDocument, communityName: string): { title: string; text: string } {
    const fallbackTitle = post.content ? `${post.content.slice(0, 60).trim()}${post.content.length > 60 ? '...' : ''}` : 'Community post';
    const title = (post.title || '').trim() || fallbackTitle;
    const text = `Check out this post from ${communityName}`;
    return { title, text };
  }

  private buildPostShareMeta(
    post: PostDocument,
    creatorName: string,
    communitySlug: string,
    communityName: string,
  ): PostShareMetaResponseDto {
    const frontendBase = (process.env.FRONTEND_URL || 'https://chabaqa.io').replace(/\/+$/, '');
    const encodedCreator = encodeURIComponent(creatorName || 'creator');
    const encodedSlug = encodeURIComponent(communitySlug || 'community');
    const encodedPostId = encodeURIComponent(post.id);
    const shareUrl = `${frontendBase}/${encodedCreator}/${encodedSlug}/home?post=${encodedPostId}`;

    const { title, text } = this.buildShareText(post, communityName);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);
    const encodedEmailBody = encodeURIComponent(`${text}\n\n${shareUrl}`);
    const encodedEmailSubject = encodeURIComponent(title);
    const whatsappText = encodeURIComponent(`${text} ${shareUrl}`);

    return {
      postId: post.id,
      shareUrl,
      title,
      text,
      platformUrls: {
        whatsapp: `https://wa.me/?text=${whatsappText}`,
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
        email: `mailto:?subject=${encodedEmailSubject}&body=${encodedEmailBody}`,
      },
    };
  }

  private parseMentionUsernames(content: string): string[] {
    const normalizedContent = String(content || '');
    const usernames = new Set<string>();
    const mentionRegex = /(^|\s)@([a-z0-9][a-z0-9._-]{1,31})/gi;

    let match: RegExpExecArray | null = mentionRegex.exec(normalizedContent);
    while (match) {
      usernames.add(match[2].toLowerCase());
      match = mentionRegex.exec(normalizedContent);
    }

    return Array.from(usernames);
  }

  private async resolveMentionedCommunityUsers(
    content: string,
    community: CommunityDocument,
  ): Promise<Types.ObjectId[]> {
    const usernames = this.parseMentionUsernames(content);
    if (usernames.length === 0) return [];

    const memberIds = [
      ...(Array.isArray(community.members) ? community.members : []),
      community.createur,
    ]
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));

    const mentionedUsers = await this.userModel
      .find({
        _id: { $in: memberIds },
        username: { $in: usernames },
      })
      .select('_id username')
      .exec();

    const uniqueIds = new Map<string, Types.ObjectId>();
    mentionedUsers.forEach((user) => {
      uniqueIds.set(user._id.toString(), new Types.ObjectId(user._id));
    });

    return Array.from(uniqueIds.values());
  }

  private async notifyMentionedUsers(params: {
    actorUserId: string;
    postId: string;
    communityId: string;
    content: string;
    community: CommunityDocument;
    commentId?: string;
    resolvedMentionedUserIds?: Types.ObjectId[];
  }): Promise<void> {
    const {
      actorUserId,
      postId,
      communityId,
      content,
      community,
      commentId,
      resolvedMentionedUserIds,
    } = params;

    const mentionedUserIds = resolvedMentionedUserIds
      ?? (await this.resolveMentionedCommunityUsers(content, community));

    if (mentionedUserIds.length === 0) return;

    const actor = await this.userModel.findById(actorUserId).select('name username').exec();
    const actorLabel = actor?.username || actor?.name || 'A member';

    await Promise.all(
      mentionedUserIds
        .filter((recipientId) => recipientId.toString() !== String(actorUserId))
        .map((recipientId) =>
          this.notificationService.createNotification({
            recipient: recipientId.toString(),
            sender: actorUserId,
            type: commentId ? 'comment_mention' : 'post_mention',
            title: commentId ? 'You were mentioned in a comment' : 'You were mentioned in a post',
            body: `${actorLabel} mentioned you in the community.`,
            data: {
              postId,
              commentId,
              communityId,
            },
          }),
        ),
    );
  }

  private buildReactionsResponse(post: PostDocument, userId?: string): PostReactionResponseDto[] {
    const me = userId ? new Types.ObjectId(userId) : null;
    const reactions = Array.isArray(post.reactions) ? post.reactions : [];

    return reactions
      .map((reaction) => {
        const userIds = Array.isArray(reaction.userIds) ? reaction.userIds : [];
        return {
          emoji: reaction.emoji,
          count: userIds.length,
          usersIncludeMe: me ? userIds.some((id) => id.equals(me)) : false,
        };
      })
      .filter((reaction) => reaction.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  private async buildThreadedComments(comments: any[]): Promise<PostCommentResponseDto[]> {
    if (!Array.isArray(comments) || comments.length === 0) return [];

    const uniqueUserIds = Array.from(
      new Set(
        comments
          .map((comment) => comment.userId?.toString())
          .filter(Boolean),
      ),
    );

    const users = await this.userModel
      .find({ _id: { $in: uniqueUserIds } })
      .select('name profile_picture photo_profil')
      .exec();

    const userMap = new Map<string, any>();
    users.forEach((user) => userMap.set(user._id.toString(), user));

    const mapped: PostCommentResponseDto[] = comments.map((comment) => {
      const user = userMap.get(comment.userId.toString());
      return {
        id: comment.id,
        content: comment.content,
        userId: comment.userId.toString(),
        userName: user?.name || 'Utilisateur inconnu',
        userAvatar: user?.photo_profil || user?.profile_picture,
        parentId: comment.parentId,
        replies: [],
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      };
    });

    mapped.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const byId = new Map<string, PostCommentResponseDto>();
    mapped.forEach((comment) => byId.set(comment.id, comment));

    const roots: PostCommentResponseDto[] = [];
    mapped.forEach((comment) => {
      if (comment.parentId && byId.has(comment.parentId)) {
        const parent = byId.get(comment.parentId)!;
        if (!parent.replies) parent.replies = [];
        parent.replies.push(comment);
      } else {
        roots.push(comment);
      }
    });

    return roots;
  }

  /**
   * Créer un nouveau post
   */
  async create(
    createPostDto: CreatePostDto,
    userId: string,
  ): Promise<PostResponseDto> {
    this.logDebug('🎯 [POST-SERVICE] Creating post with data:', {
      communityId: createPostDto.communityId,
      userId,
      title: createPostDto.title
    });

    // Check if the user exists
    const userExists = await this.userModel.findById(userId).select('name email');
    this.logDebug('👤 [POST-SERVICE] User creating post:', {
      userId,
      userExists: !!userExists,
      userName: userExists?.name,
      userEmail: userExists?.email
    });

    // Vérifier que la communauté existe
    const community = await this.communityModel.findById(createPostDto.communityId);
    this.logDebug('🏘️ [POST-SERVICE] Community found:', community ? community.name : 'NONE');

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
      reactions: [],
      isPinned: false,
      pinnedAt: null,
      mentionedUserIds: await this.resolveMentionedCommunityUsers(createPostDto.content, community),
      likedBy: [],
      sharedBy: [],
      tags: createPostDto.tags || [],
      images: createPostDto.images || [],
      videos: createPostDto.videos || [],
      links: createPostDto.links || [],
    });

    const savedPost = await post.save();
    this.logDebug(' [POST-SERVICE] Post saved with ID:', savedPost._id);

    // Récupérer les informations complètes avec populated author
    const populatedPost = await this.postModel
      .findById(savedPost._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    this.logDebug(' [POST-SERVICE] Post created with author data:', {
      postId: populatedPost!.id,
      authorId: populatedPost!.authorId,
      authorName: (populatedPost!.authorId as any)?.name,
      authorEmail: (populatedPost!.authorId as any)?.email
    });

    await this.notifyMentionedUsers({
      actorUserId: userId,
      postId: savedPost.id,
      communityId: savedPost.communityId,
      content: savedPost.content,
      community,
      resolvedMentionedUserIds: savedPost.mentionedUserIds,
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
    this.logDebug('🔍 [POST-SERVICE] FindAll called with:', { page, limit, communityId, authorId, tags, search });

    const query: any = { isPublished: true };

    // Filtres
    if (communityId) {
      query.communityId = communityId;
      this.logDebug('🏘️ [POST-SERVICE] Filtering by community:', communityId);
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

    this.logDebug('📋 [POST-SERVICE] Final query:', JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .select('+likedBy') // Explicitly select likedBy array
        .populate('authorId', 'name email profile_picture photo_profil')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments(query),
    ]);

    this.logDebug('📝 [POST-SERVICE] Posts fetched with population:', posts.map(p => ({
      id: p.id,
      authorId: p.authorId,
      authorName: (p.authorId as any)?.name || 'NOT_POPULATED',
      likes: p.likes,
      likedByCount: p.likedBy?.length || 0,
      likedByIds: p.likedBy?.map((id: Types.ObjectId) => id.toString()) || []
    })));
    
    this.logDebug('👤 [POST-SERVICE] Current userId for like check:', userId);

    this.logDebug('📊 [POST-SERVICE] Query results:', {
      postsFound: posts.length,
      totalCount: total,
      skip,
      limit
    });

    // Récupérer les informations des communautés
    const communityIds = [...new Set(posts.map((post) => post.communityId))];
    this.logDebug('🔍 [POST-SERVICE] Looking up communities for IDs:', communityIds);

    let communities: CommunityDocument[] = [];
    try {
      communities = await this.communityModel.find({
        _id: {
          $in: communityIds.map(id => {
            try {
              return new Types.ObjectId(id);
            } catch (error) {
              this.logWarn('⚠️ [POST-SERVICE] Invalid ObjectId format:', id);
              return null;
            }
          }).filter(Boolean)
        },
      });
      this.logDebug('✅ [POST-SERVICE] Found communities:', communities.length);
    } catch (error) {
      this.logError('❌ [POST-SERVICE] Error fetching communities:', error);
      communities = [];
    }

    const postsWithCommunities = await Promise.all(
      posts.map(async (post) => {
        try {
          const community = communities.find((c) => c._id.toString() === post.communityId);
          return await this.transformToResponseDto(post, community, userId);
        } catch (error) {
          this.logError('❌ [POST-SERVICE] Error transforming post:', post.id, error);
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
            reactions: [],
            isLikedByUser: false,
            isBookmarkedByUser: false,
            isSharedByUser: false,
            isPinned: Boolean(post.isPinned),
            pinnedAt: post.pinnedAt ? post.pinnedAt.toISOString() : undefined,
            comments: [],
            commentsCount: 0,
            tags: post.tags || [],
            images: post.images || [],
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
    
    this.logDebug('🔐 [POST-SERVICE] Authorization check for update:', {
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
    
    this.logDebug('🔐 [POST-SERVICE] Authorization check for delete:', {
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

    return this.buildThreadedComments(post.comments);
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
    if (createCommentDto.parentId) {
      const parentExists = post.comments.some((comment) => comment.id === createCommentDto.parentId);
      if (!parentExists) {
        throw new NotFoundException('Commentaire parent non trouvé');
      }
    }

    const comment = {
      id: new Types.ObjectId().toString(),
      content: createCommentDto.content,
      userId: new Types.ObjectId(userId),
      parentId: createCommentDto.parentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    post.addComment(comment);
    await post.save();

    try {
      await this.contentTrackingService.trackAction(
        userId,
        post.id || post._id.toString(),
        TrackableContentType.POST,
        TrackingActionType.COMMENT,
        { source: 'post_comment', commentId: comment.id, communityId: post.communityId },
      );
    } catch (error: any) {
      this.logWarn(`⚠️ [POST-SERVICE] Failed to track comment: ${error?.message || error}`);
    }

    await this.notifyMentionedUsers({
      actorUserId: userId,
      postId: post.id,
      commentId: comment.id,
      communityId: post.communityId,
      content: createCommentDto.content,
      community,
    });

    // Récupérer les informations de l'utilisateur
    const user = await this.userModel
      .findById(userId)
      .select('name profile_picture photo_profil');

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.userId.toString(),
      userName: user?.name || 'Utilisateur inconnu',
      userAvatar: user?.photo_profil || user?.profile_picture,
      parentId: comment.parentId,
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
    
    this.logDebug('🔐 [POST-SERVICE] Authorization check for comment delete:', {
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
    
    this.logDebug('🔐 [POST-SERVICE] Authorization check for comment update:', {
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

    const community = await this.communityModel.findById(post.communityId);
    if (community) {
      await this.notifyMentionedUsers({
        actorUserId: userId,
        postId: post.id,
        commentId,
        communityId: post.communityId,
        content,
        community,
      });
    }

    // Récupérer les informations de l'utilisateur
    const user = await this.userModel
      .findById(userId)
      .select('name profile_picture photo_profil');

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.userId.toString(),
      userName: user?.name || 'Utilisateur inconnu',
      userAvatar: user?.photo_profil || user?.profile_picture,
      parentId: comment.parentId,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  async reactToPost(
    postId: string,
    emoji: string,
    userId: string,
  ): Promise<PostResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) throw new NotFoundException('Post non trouvé');

    const normalizedEmoji = String(emoji || '').trim();
    if (!normalizedEmoji) {
      throw new BadRequestException('Emoji de réaction invalide');
    }

    const userObjectId = new Types.ObjectId(userId);
    const reactions = Array.isArray(post.reactions) ? post.reactions : [];
    const selectedReaction = reactions.find((reaction) => reaction.emoji === normalizedEmoji);
    const hadSelectedReaction = Boolean(
      selectedReaction?.userIds?.some((id) => id.equals(userObjectId)),
    );

    // Keep at most one active reaction per user by removing the user
    // from all emoji buckets before applying the selected emoji.
    for (const reaction of reactions) {
      reaction.userIds = reaction.userIds.filter((id) => !id.equals(userObjectId));
    }

    // Toggle behavior: clicking the same emoji removes reaction;
    // clicking a different emoji switches to that one.
    if (!hadSelectedReaction) {
      if (selectedReaction) {
        selectedReaction.userIds.push(userObjectId);
      } else {
        reactions.push({ emoji: normalizedEmoji, userIds: [userObjectId] } as any);
      }
    }

    post.reactions = reactions.filter((reaction) => reaction.userIds.length > 0);
    post.markModified('reactions');
    await post.save();

    const populatedPost = await this.postModel
      .findById(post._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    const community = await this.communityModel.findById(post.communityId);
    return this.transformToResponseDto(populatedPost!, community, userId);
  }

  async pinPost(postId: string, userId: string): Promise<PostResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) throw new NotFoundException('Post non trouvé');

    const community = await this.communityModel.findById(post.communityId);
    if (!community) throw new NotFoundException('Communauté non trouvée');

    if (community.createur.toString() !== String(userId)) {
      throw new ForbiddenException('Seul le créateur de la communauté peut épingler un post');
    }

    post.isPinned = true;
    post.pinnedAt = new Date();
    await post.save();

    const populatedPost = await this.postModel
      .findById(post._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    return this.transformToResponseDto(populatedPost!, community, userId);
  }

  async unpinPost(postId: string, userId: string): Promise<PostResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) throw new NotFoundException('Post non trouvé');

    const community = await this.communityModel.findById(post.communityId);
    if (!community) throw new NotFoundException('Communauté non trouvée');

    if (community.createur.toString() !== String(userId)) {
      throw new ForbiddenException('Seul le créateur de la communauté peut désépingler un post');
    }

    post.isPinned = false;
    post.pinnedAt = undefined;
    await post.save();

    const populatedPost = await this.postModel
      .findById(post._id)
      .populate('authorId', 'name email profile_picture photo_profil')
      .exec();

    return this.transformToResponseDto(populatedPost!, community, userId);
  }

  /**
   * Liker un post
   */
  async likePost(
    postId: string,
    userId: string,
    metadata: Record<string, any> = {},
  ): Promise<PostStatsResponseDto> {
    const post = await this.postModel.findOne({ id: postId });
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userIdObj = new Types.ObjectId(userId);
    this.logDebug('👍 [POST-SERVICE] Attempting to like post:', {
      postId: post.id,
      userId: userId,
      userIdObj: userIdObj.toString(),
      currentLikedBy: post.likedBy.map((id: Types.ObjectId) => id.toString()),
      currentLikes: post.likes
    });
    
    const wasLiked = post.likePost(userIdObj);

    if (!wasLiked) {
      this.logDebug('ℹ️ [POST-SERVICE] User already liked this post');
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

    this.logDebug('✅ [POST-SERVICE] Like added, saving...', {
      newLikedBy: post.likedBy.map((id: Types.ObjectId) => id.toString()),
      newLikes: post.likes
    });
    
    await post.save();
    await this.contentTrackingService.trackLike(
      userId,
      post.id,
      TrackableContentType.POST,
      {
        source: 'post_endpoint',
        communityId: post.communityId,
        ...metadata,
      },
    );

    this.logDebug('💾 [POST-SERVICE] Post saved successfully');

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
    metadata: Record<string, any> = {},
  ): Promise<PostStatsResponseDto> {
    const post = await this.resolvePostByIdentifier(postId);
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const userObjectId = new Types.ObjectId(userId);
    const shared = post.sharePost(userObjectId);

    // Save even if already shared? only save when new share to avoid extra writes.
    if (shared) {
      await post.save();
      await this.contentTrackingService.trackShare(
        userId,
        post.id,
        TrackableContentType.POST,
        {
          source: 'post_endpoint',
          communityId: post.communityId,
          ...metadata,
        },
      );
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

  async getPostShareMeta(postId: string): Promise<PostShareMetaResponseDto> {
    const post = await this.resolvePostByIdentifier(postId);
    if (!post) {
      throw new NotFoundException('Post non trouvé');
    }

    const community = await this.communityModel
      .findById(post.communityId)
      .select('slug name createur')
      .exec();

    const communitySlug = community?.slug || 'community';
    const communityName = community?.name || 'community';

    let creatorName = 'creator';
    if (community?.createur) {
      const creator = await this.userModel.findById(community.createur).select('name').exec();
      if (creator?.name && creator.name.trim().length > 0) {
        creatorName = creator.name.trim();
      }
    }

    return this.buildPostShareMeta(post, creatorName, communitySlug, communityName);
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
    communityId?: string,
    currentUserId?: string,
  ): Promise<PostListResponseDto> {
    return this.findAll(page, limit, communityId, authorId, undefined, undefined, currentUserId);
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
    this.logDebug('🏘️ [POST-SERVICE] Finding posts for community:', communityId);
    this.logDebug('📄 [POST-SERVICE] Pagination:', { page, limit });

    try {
      // First, let's check if any posts exist at all
      const totalPosts = await this.postModel.countDocuments({});
      const communityPosts = await this.postModel.countDocuments({ communityId });

      this.logDebug('📊 [POST-SERVICE] Database stats:', {
        totalPosts,
        communityPosts,
        communityId
      });

      // If no posts exist, return empty result
      if (totalPosts === 0) {
        this.logDebug('ℹ️ [POST-SERVICE] No posts in database, returning empty result');
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
      this.logDebug('✅ [POST-SERVICE] Found posts:', result.posts.length);
      return result;
    } catch (error) {
      this.logError('❌ [POST-SERVICE] Error in findByCommunity:', error);

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
      this.logDebug('🔄 [POST-SERVICE] Transforming post:', post.id);

      // Transformer les commentaires avec error handling
      let comments: any[] = [];
      try {
        comments = await this.buildThreadedComments(post.comments);
      } catch (commentsError) {
        this.logError('❌ [POST-SERVICE] Error transforming comments:', commentsError);
        comments = [];
      }

      // Récupérer les informations de l'auteur avec error handling
      let author: any = null;
      try {
        this.logDebug('👤 [POST-SERVICE] Fetching author for post:', post.id);
        this.logDebug('🔍 [POST-SERVICE] Author ID type:', typeof post.authorId);
        this.logDebug('🔍 [POST-SERVICE] Author ID value:', post.authorId);

        // First try to get from populated data if available
        if (post.authorId && typeof post.authorId === 'object' && (post.authorId as any).name) {
          author = post.authorId;
          this.logDebug('✅ [POST-SERVICE] Using populated author data:', author.name);
        } else {
          // Fallback to direct lookup
          this.logDebug('🔍 [POST-SERVICE] Performing direct user lookup for ID:', post.authorId);

          // Try multiple approaches to get user data
          this.logDebug('🔄 [POST-SERVICE] Trying multiple user lookup approaches...');

          // Approach 1: Direct findById
          author = await this.userModel
            .findById(post.authorId)
            .select('name email profile_picture photo_profil')
            .exec();

          this.logDebug('🔍 [POST-SERVICE] Approach 1 (direct lookup) result:', {
            found: !!author,
            name: author?.name,
            email: author?.email,
            profile_picture: author?.profile_picture,
            photo_profil: author?.photo_profil
          });

          // Approach 2: If first approach failed, try without select
          if (!author) {
            this.logDebug('🔄 [POST-SERVICE] Trying without select...');
            const fullUser = await this.userModel.findById(post.authorId).exec();
            if (fullUser) {
              author = {
                name: fullUser.name,
                email: fullUser.email,
                profile_picture: fullUser.profile_picture || fullUser.photo_profil,
                _id: fullUser._id
              };
              this.logDebug('✅ [POST-SERVICE] Approach 2 success:', author);
            } else {
              this.logDebug('❌ [POST-SERVICE] User not found with ID:', post.authorId);
            }
          }

          // Approach 3: Check if authorId is valid ObjectId format
          if (!author) {
            this.logDebug('🔍 [POST-SERVICE] Checking if authorId is valid ObjectId format...');
            try {
              const isValidObjectId = Types.ObjectId.isValid(post.authorId);
              this.logDebug('🔍 [POST-SERVICE] Is valid ObjectId:', isValidObjectId);

              if (isValidObjectId) {
                // Try to find any user to see if the model works
                const anyUser = await this.userModel.findOne().select('name email _id').exec();
                this.logDebug('🔍 [POST-SERVICE] Can find any user?', !!anyUser);
                if (anyUser) {
                  this.logDebug('📝 [POST-SERVICE] Sample user found:', {
                    _id: anyUser._id,
                    name: anyUser.name,
                    email: anyUser.email
                  });
                }
              }
            } catch (objectIdError) {
              this.logError('❌ [POST-SERVICE] ObjectId validation error:', objectIdError);
            }
          }
        }
      } catch (authorError) {
        this.logError('❌ [POST-SERVICE] Error fetching author:', authorError);
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

      this.logDebug('👤 [POST-SERVICE] Final author name for post:', post.id, '->', authorName, 'Role:', authorRole);

      // Helper function to safely get author ID as string
      const getAuthorIdString = (): string => {
        try {
          if (typeof post.authorId === 'object' && post.authorId) {
            const authorObj = post.authorId as any;
            return authorObj._id?.toString() || authorObj.toString() || 'unknown';
          }
          return (post.authorId as any)?.toString() || 'unknown';
        } catch (error) {
          this.logWarn('⚠️ [POST-SERVICE] Error converting authorId to string:', error);
          return 'unknown';
        }
      };

      const authorIdString = getAuthorIdString();

      // Calculate isLikedByUser based on userId
      let isLikedByUser = false;
      if (userId) {
        try {
          const userObjectId = new Types.ObjectId(userId);
          this.logDebug('🔍 [POST-SERVICE] Checking if user liked post:', {
            postId: post.id,
            userId: userId,
            userObjectId: userObjectId.toString(),
            likedByArray: post.likedBy.map((id: Types.ObjectId) => id.toString()),
            likedByCount: post.likedBy.length
          });
          isLikedByUser = post.isLikedBy(userObjectId);
          this.logDebug('✅ [POST-SERVICE] isLikedBy result:', isLikedByUser);
        } catch (error) {
          this.logWarn('⚠️ [POST-SERVICE] Invalid userId for like check:', userId);
        }
      }

      let isBookmarkedByUser = false;
      if (userId) {
        try {
          const userObjectId = new Types.ObjectId(userId);
          isBookmarkedByUser = post.bookmarks.some((bookmarkId: Types.ObjectId) => bookmarkId.equals(userObjectId));
        } catch (error) {
          this.logWarn('⚠️ [POST-SERVICE] Invalid userId for bookmark check:', userId);
        }
      }

      let isSharedByUser = false;
      if (userId) {
        try {
          isSharedByUser = post.isSharedBy(new Types.ObjectId(userId));
        } catch (error) {
          this.logWarn('⚠️ [POST-SERVICE] Invalid userId for share check:', userId);
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
        reactions: this.buildReactionsResponse(post, userId),
        isLikedByUser,
        isBookmarkedByUser,
        shareCount: post.shareCount || 0,
        isSharedByUser,
        isPinned: Boolean(post.isPinned),
        pinnedAt: post.pinnedAt ? post.pinnedAt.toISOString() : undefined,
        comments,
        commentsCount: post.comments.length,
        tags: post.tags || [],
        images: post.images || [],
        videos: post.videos || [],
        links: post.links || [],
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      };

      this.logDebug('✅ [POST-SERVICE] Successfully transformed post:', post.id);
      return result;
    } catch (error) {
      this.logError('❌ [POST-SERVICE] Critical error in transformToResponseDto:', error);
      this.logError('Post data:', {
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
        reactions: [],
        isBookmarkedByUser: false,
        shareCount: post.shareCount || 0,
        isLikedByUser: false,
        isSharedByUser: false,
        isPinned: false,
        pinnedAt: undefined,
        comments: [],
        commentsCount: 0,
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
  async bookmarkPost(
    postId: string,
    userId: string,
    metadata: Record<string, any> = {},
  ): Promise<void> {
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
      await this.contentTrackingService.addBookmark(
        userId,
        post.id,
        TrackableContentType.POST,
        `post:${post.id}:user:${userId}`,
        {
          source: 'post_endpoint',
          communityId: post.communityId,
          ...metadata,
        },
      );
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
      this.logDebug('📊 [POST-SERVICE] Total posts in database:', count);
      return count;
    } catch (error) {
      this.logError('❌ [POST-SERVICE] Error counting posts:', error);
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
      .populate('authorId', 'name email profile_picture photo_profil')
      .select('+likedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    // Compter le total
    const total = await this.postModel.countDocuments({
      bookmarks: userObjectId,
      isPublished: true,
    });

    // Resolve communities once so we can apply the same role logic used by the main feed.
    const communityIds = [...new Set(posts.map((post) => post.communityId).filter(Boolean))];
    const communities = await this.communityModel
      .find({
        _id: {
          $in: communityIds
            .map((id) => {
              try {
                return new Types.ObjectId(id);
              } catch {
                return null;
              }
            })
            .filter(Boolean),
        },
      })
      .select('name slug createur admins members')
      .exec();

    // Transformer les posts using canonical transformer for consistent author role/shape.
    const transformedPosts = await Promise.all(
      posts.map(async (post) => {
        const community = communities.find((c) => c._id.toString() === post.communityId);
        const transformed = await this.transformToResponseDto(post, community, userId);
        return {
          ...transformed,
          isBookmarkedByUser: true,
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

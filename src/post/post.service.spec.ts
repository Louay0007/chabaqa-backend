import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PostService } from './post.service';
import { Post } from '../schema/post.schema';
import { Community } from '../schema/community.schema';
import { User } from '../schema/user.schema';
import { ContentTrackingService } from '../common/services/content-tracking.service';
import { NotificationService } from '../notification/notification.service';

describe('PostService share flow', () => {
  let service: PostService;

  const mockPostModel: any = {
    findOne: jest.fn(),
    findById: jest.fn(),
    deleteOne: jest.fn(),
  };

  const mockCommunityModel: any = {
    findById: jest.fn(),
  };

  const mockUserModel: any = {
    findById: jest.fn(),
  };

  const mockTrackingService: any = {
    trackShare: jest.fn(),
    trackLike: jest.fn(),
    trackBookmark: jest.fn(),
  };

  const mockNotificationService: any = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: getModelToken(Community.name), useValue: mockCommunityModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: ContentTrackingService, useValue: mockTrackingService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    process.env.FRONTEND_URL = 'https://chabaqa.io';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URL;
  });

  it('returns canonical share metadata with platform URLs', async () => {
    const creatorId = new Types.ObjectId();
    const post: any = {
      id: 'post-1',
      title: 'Design System Tips',
      content: 'Useful content',
      communityId: new Types.ObjectId().toString(),
    };

    mockPostModel.findOne.mockResolvedValue(post);
    mockCommunityModel.findById.mockReturnValue({
      select: () => ({
        exec: jest.fn().mockResolvedValue({
          slug: 'chabaqa-test',
          name: 'Chabaqa Test',
          createur: creatorId,
        }),
      }),
    });
    mockUserModel.findById.mockReturnValue({
      select: () => ({
        exec: jest.fn().mockResolvedValue({ name: 'Chabaqa Test' }),
      }),
    });

    const result = await service.getPostShareMeta('post-1');

    expect(result.postId).toBe('post-1');
    expect(result.shareUrl).toBe('https://chabaqa.io/Chabaqa%20Test/chabaqa-test/home?post=post-1');
    expect(result.platformUrls.whatsapp).toContain('wa.me');
    expect(result.platformUrls.x).toContain(encodeURIComponent(result.shareUrl));
    expect(result.platformUrls.facebook).toContain(encodeURIComponent(result.shareUrl));
    expect(result.platformUrls.linkedin).toContain(encodeURIComponent(result.shareUrl));
    expect(result.platformUrls.telegram).toContain(encodeURIComponent(result.shareUrl));
    expect(result.platformUrls.email).toContain('mailto:');
  });

  it('shares only once per user and tracks metadata on first share', async () => {
    const userId = new Types.ObjectId().toString();
    let alreadyShared = false;
    const post: any = {
      id: 'post-2',
      likes: 0,
      shareCount: 0,
      communityId: new Types.ObjectId().toString(),
      sharePost: jest.fn().mockImplementation(() => {
        if (alreadyShared) return false;
        alreadyShared = true;
        post.shareCount = 1;
        return true;
      }),
      save: jest.fn().mockResolvedValue(true),
      getCommentsCount: jest.fn().mockReturnValue(0),
      isLikedBy: jest.fn().mockReturnValue(false),
      isSharedBy: jest.fn().mockReturnValue(true),
    };

    mockPostModel.findOne.mockResolvedValue(post);

    const first = await service.sharePost('post-2', userId, {
      shareMethod: 'copy_link',
      targetUrl: 'https://chabaqa.io/Creator/chabaqa-test/home?post=post-2',
    });
    const second = await service.sharePost('post-2', userId, {
      shareMethod: 'copy_link',
      targetUrl: 'https://chabaqa.io/Creator/chabaqa-test/home?post=post-2',
    });

    expect(first.totalShares).toBe(1);
    expect(second.totalShares).toBe(1);
    expect(post.save).toHaveBeenCalledTimes(1);
    expect(mockTrackingService.trackShare).toHaveBeenCalledTimes(1);
    expect(mockTrackingService.trackShare).toHaveBeenCalledWith(
      userId,
      post.id,
      expect.anything(),
      expect.objectContaining({
        shareMethod: 'copy_link',
        targetUrl: 'https://chabaqa.io/Creator/chabaqa-test/home?post=post-2',
      }),
    );
  });

  it('supports sharing by Mongo _id through identifier fallback', async () => {
    const mongoId = new Types.ObjectId();
    const userId = new Types.ObjectId().toString();
    const post: any = {
      id: 'post-3',
      likes: 0,
      shareCount: 1,
      communityId: new Types.ObjectId().toString(),
      sharePost: jest.fn().mockReturnValue(false),
      save: jest.fn().mockResolvedValue(true),
      getCommentsCount: jest.fn().mockReturnValue(0),
      isLikedBy: jest.fn().mockReturnValue(false),
      isSharedBy: jest.fn().mockReturnValue(true),
    };

    mockPostModel.findOne.mockResolvedValue(null);
    mockPostModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(post),
    });

    const result = await service.sharePost(mongoId.toString(), userId, { shareMethod: 'x' });

    expect(mockPostModel.findById).toHaveBeenCalled();
    expect(result.postId).toBe('post-3');
    expect(result.totalShares).toBe(1);
  });

  it('throws when getting share metadata for unknown post', async () => {
    mockPostModel.findOne.mockResolvedValue(null);

    await expect(service.getPostShareMeta('missing-post')).rejects.toThrow('Post non trouvé');
  });

  describe('remove', () => {
    it('deletes when requester is the post author', async () => {
      const post: any = {
        _id: new Types.ObjectId(),
        authorId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      };

      mockPostModel.findOne.mockResolvedValue(post);
      mockPostModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await service.remove('post-1', '507f1f77bcf86cd799439011');

      expect(mockPostModel.findOne).toHaveBeenCalledWith({ id: 'post-1' });
      expect(mockPostModel.deleteOne).toHaveBeenCalledWith({ _id: post._id });
      expect(result).toEqual({ message: 'Post supprimé avec succès' });
    });

    it('throws ForbiddenException for non-author', async () => {
      const post: any = {
        _id: new Types.ObjectId(),
        authorId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      };
      mockPostModel.findOne.mockResolvedValue(post);

      await expect(service.remove('post-1', '507f1f77bcf86cd799439012')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockPostModel.deleteOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown post id', async () => {
      mockPostModel.findOne.mockResolvedValue(null);

      await expect(service.remove('missing-post', '507f1f77bcf86cd799439011')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPostModel.deleteOne).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PostScheduler } from './post.scheduler';
import { PostService } from './post.service';

describe('PostScheduler', () => {
  let scheduler: PostScheduler;
  let postService: Partial<PostService>;

  beforeEach(async () => {
    postService = {
      publishDuePosts: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostScheduler,
        { provide: PostService, useValue: postService },
      ],
    }).compile();

    scheduler = module.get<PostScheduler>(PostScheduler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('calls postService.publishDuePosts on each tick', async () => {
    await scheduler.handleScheduledPosts();
    expect(postService.publishDuePosts).toHaveBeenCalledTimes(1);
  });

  it('does not throw when publishDuePosts succeeds', async () => {
    await expect(scheduler.handleScheduledPosts()).resolves.toBeUndefined();
  });

  it('does not propagate errors from publishDuePosts (logs only)', async () => {
    (postService.publishDuePosts as jest.Mock).mockRejectedValue(
      new Error('DB error'),
    );
    // Should not throw even if the service fails
    await expect(scheduler.handleScheduledPosts()).resolves.toBeUndefined();
  });
});
